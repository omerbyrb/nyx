//go:build !windows

package main

import "fmt"

// Stubs — evasion techniques are Windows-only.

var EnableAmsi      = "0"
var EnableEtw       = "0"
var EnablePpid      = "0"
var PpidTarget      = ""
var EnableSleepMask = "0"
var EnableSyscalls  = "0"

func initEvasion() string   { return "evasion: Windows-only" }
func evasionStatus() string { return "evasion: Windows-only" }
func initSleepMask()        {}
func maskSensitiveData()    {}
func unmaskSensitiveData()  {}

func spawnWithSpoofedPpid(parent, cmd string) (string, error) {
	return "", fmt.Errorf("Windows-only")
}
func patchAmsi() error { return fmt.Errorf("Windows-only") }
func patchEtw() error  { return fmt.Errorf("Windows-only") }
