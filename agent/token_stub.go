//go:build !windows

package main

import "fmt"

func impersonateProcess(pid uint32) (string, error) { return "", fmt.Errorf("Windows-only") }
func makeToken(domain, username, password string) (string, error) {
	return "", fmt.Errorf("Windows-only")
}
func revertToken() string                  { return "Windows-only" }
func spawnAsCurrentToken(cmd string) (string, error) { return "", fmt.Errorf("Windows-only") }
func listTokens() string                   { return "Windows-only" }
