"""
Nyx Plugin System — dynamically loads Python plugins from the plugins/ directory.

A plugin is a Python file that may define any subset of these hooks:

  PLUGIN_NAME    = "my_plugin"       # required
  PLUGIN_VERSION = "1.0.0"           # optional

  def on_agent_new(agent: dict):              # new agent first checkin
  def on_agent_checkin(agent: dict):          # every checkin
  def on_task_queued(task: dict):             # operator queued a task
  def on_task_result(agent: dict, task: dict, result: dict):  # task completed
  def on_event(event: dict):                  # every operation event logged

Plugins can import anything available on the server's Python path.
They are reloaded from disk when reload_plugins() is called.
"""

import importlib.util
import logging
import os
import traceback
from pathlib import Path
from typing import Callable

log = logging.getLogger("nyx.plugins")

_PLUGIN_DIR = Path(__file__).parent.parent.parent / "plugins"
_plugins: list = []   # loaded plugin modules

HOOK_NAMES = [
    "on_agent_new",
    "on_agent_checkin",
    "on_task_queued",
    "on_task_result",
    "on_event",
]


def load_plugins() -> list[str]:
    """Discover and load all plugins from the plugins/ directory."""
    global _plugins
    _plugins = []
    loaded = []

    if not _PLUGIN_DIR.exists():
        _PLUGIN_DIR.mkdir(parents=True, exist_ok=True)
        return []

    for path in sorted(_PLUGIN_DIR.glob("*.py")):
        if path.name.startswith("_"):
            continue
        try:
            spec = importlib.util.spec_from_file_location(path.stem, path)
            if spec is None or spec.loader is None:
                continue
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)  # type: ignore
            name = getattr(mod, "PLUGIN_NAME", path.stem)
            ver  = getattr(mod, "PLUGIN_VERSION", "?")
            _plugins.append(mod)
            loaded.append(f"{name} v{ver}")
            log.info("Plugin loaded: %s v%s", name, ver)
        except Exception as e:
            log.error("Failed to load plugin %s: %s", path.name, e)

    return loaded


def reload_plugins() -> list[str]:
    """Reload all plugins (drops existing modules)."""
    return load_plugins()


def list_plugins() -> list[dict]:
    return [
        {
            "name":    getattr(m, "PLUGIN_NAME", m.__name__),
            "version": getattr(m, "PLUGIN_VERSION", "?"),
            "hooks":   [h for h in HOOK_NAMES if hasattr(m, h)],
        }
        for m in _plugins
    ]


def _fire(hook: str, *args, **kwargs):
    """Call a named hook on all loaded plugins that implement it."""
    for mod in _plugins:
        fn: Callable = getattr(mod, hook, None)
        if fn is None:
            continue
        try:
            fn(*args, **kwargs)
        except Exception:
            log.error("Plugin %s hook %s raised:\n%s",
                      getattr(mod, "PLUGIN_NAME", "?"), hook, traceback.format_exc())


def fire_agent_new(agent: dict):
    _fire("on_agent_new", agent)

def fire_agent_checkin(agent: dict):
    _fire("on_agent_checkin", agent)

def fire_task_queued(task: dict):
    _fire("on_task_queued", task)

def fire_task_result(agent: dict, task: dict, result: dict):
    _fire("on_task_result", agent, task, result)

def fire_event(event: dict):
    _fire("on_event", event)


# Auto-load on import
load_plugins()
