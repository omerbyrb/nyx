//go:build !windows

package main

import "fmt"

func startPipeServer(name string) (string, error)           { return "", fmt.Errorf("Windows-only") }
func stopPipeServer() string                                { return "Windows-only" }
func connectToPipeServer(host, name string) (string, error) { return "", fmt.Errorf("Windows-only") }
func smbPipeStatus() string                                 { return "Windows-only" }
