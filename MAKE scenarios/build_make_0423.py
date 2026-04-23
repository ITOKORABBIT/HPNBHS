import json
from copy import deepcopy
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
TOKEN_PLACEHOLDER = "__SET_WEBHOOK_TOKEN__"


def load_blueprint(filename: str) -> dict:
    path = BASE_DIR / filename
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save_blueprint(filename: str, data: dict) -> None:
    path = BASE_DIR / filename
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=4) + "\n",
        encoding="utf-8-sig",
    )


def set_filter(module: dict, name: str, conditions: list[list[dict]]) -> None:
    module["filter"] = {
        "name": name,
        "conditions": conditions,
    }


def add_interface_fields(webhook_module: dict, fields: list[dict]) -> None:
    interface = webhook_module.setdefault("metadata", {}).setdefault("interface", [])
    existing_names = {item.get("name") for item in interface}
    for field in fields:
        if field["name"] not in existing_names:
            interface.append(field)


def build_guard_module(module_id: int, x: int, y: int) -> dict:
    return {
        "id": module_id,
        "module": "util:SetVariable2",
        "version": 1,
        "parameters": {},
        "mapper": {
            "name": "request_guard_status",
            "scope": "roundtrip",
            "value": "validated",
        },
        "metadata": {
            "designer": {
                "x": x,
                "y": y,
            },
            "restore": {
                "expect": {
                    "scope": {
                        "label": "One cycle",
                    }
                }
            },
            "expect": [
                {
                    "name": "name",
                    "type": "text",
                    "label": "Variable name",
                    "required": True,
                },
                {
                    "name": "scope",
                    "type": "select",
                    "label": "Variable lifetime",
                    "required": True,
                    "validate": {
                        "enum": ["roundtrip", "execution"],
                    },
                },
                {
                    "name": "value",
                    "type": "any",
                    "label": "Variable value",
                },
            ],
            "interface": [
                {
                    "name": "request_guard_status",
                    "type": "any",
                    "label": "request_guard_status",
                }
            ],
        },
    }


def update_report_blueprint() -> None:
    data = load_blueprint("HPNBHS - New Report Push.json")
    data["name"] = "HPNBHS - New Report Push 0423"

    webhook = deepcopy(data["flow"][0])
    hero = deepcopy(data["flow"][1])
    line_push = deepcopy(data["flow"][2])

    add_interface_fields(
        webhook,
        [
            {"name": "token", "type": "text", "label": "token"},
            {"name": "method", "type": "text", "label": "method"},
        ],
    )

    guard = build_guard_module(module_id=20, x=300, y=64)
    set_filter(
        guard,
        "Allow only POST + valid token",
        [[
            {"a": "{{lower(1.method)}}", "o": "text:equal", "b": "post"},
            {"a": "{{trim(1.token)}}", "o": "text:equal", "b": TOKEN_PLACEHOLDER},
        ]],
    )

    hero["metadata"]["designer"] = {"x": 668, "y": 64}
    set_filter(
        hero,
        "Require report payload fields",
        [[
            {"a": "{{length(trim(1.title))}}", "o": "number:greater", "b": "0"},
            {"a": "{{length(trim(1.cate))}}", "o": "number:greater", "b": "0"},
        ]],
    )

    line_push["metadata"]["designer"] = {"x": 1010, "y": 64}

    data["flow"] = [webhook, guard, hero, line_push]

    save_blueprint("HPNBHS - New Report Push 0423.json", data)


def update_store_blueprint() -> None:
    data = load_blueprint("HPNBHS - New Store Push.json")
    data["name"] = "HPNBHS - New Store Push 0423"

    webhook = deepcopy(data["flow"][0])
    hero = deepcopy(data["flow"][1])
    line_push = deepcopy(data["flow"][2])

    add_interface_fields(
        webhook,
        [
            {"name": "token", "type": "text", "label": "token"},
            {"name": "method", "type": "text", "label": "method"},
        ],
    )

    guard = build_guard_module(module_id=20, x=300, y=0)
    set_filter(
        guard,
        "Allow only POST + valid token",
        [[
            {"a": "{{lower(1.method)}}", "o": "text:equal", "b": "post"},
            {"a": "{{trim(1.token)}}", "o": "text:equal", "b": TOKEN_PLACEHOLDER},
        ]],
    )

    hero["metadata"]["designer"] = {"x": 1200, "y": 0}
    set_filter(
        hero,
        "Require store payload fields",
        [[
            {"a": "{{length(trim(1.title))}}", "o": "number:greater", "b": "0"},
            {"a": "{{length(trim(1.addr))}}", "o": "number:greater", "b": "0"},
        ]],
    )

    line_push["metadata"]["designer"] = {"x": 1500, "y": 0}

    data["flow"] = [webhook, guard, hero, line_push]

    save_blueprint("HPNBHS - New Store Push 0423.json", data)


if __name__ == "__main__":
    update_report_blueprint()
    update_store_blueprint()
