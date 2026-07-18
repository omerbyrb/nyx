//go:build !windows

package main

import "fmt"

var ssnCache = map[string]uint32{}
var ssnInitDone bool

func initSSNTable() (string, error)      { return "", fmt.Errorf("windows only") }
func getSSN(_ string) (uint32, bool)     { return 0, false }
func makeSyscallStub(_ uint32) (uintptr, error) { return 0, fmt.Errorf("windows only") }
func ssnStatus() string                  { return "windows only" }
