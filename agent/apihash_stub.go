//go:build !windows

package main

import "fmt"

func djb2Hash(s string) uint32                       { return 0 }
func resolveByHash(_ uintptr, _ uint32) uintptr      { return 0 }
func resolveAPI(_ string, _ uint32) (uintptr, error) { return 0, fmt.Errorf("windows only") }
func xorStr(s string, key byte) string               { return s }
func apiHashReport() string                          { return "windows only" }
func wideStringHash(_ string) uint32                 { return 0 }
