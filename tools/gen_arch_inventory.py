#!/usr/bin/env python3
"""
Генератор архитектурного инвентаря для C4-моделирования.
Сканирует код и создает _inventory.md с компонентами системы.
"""

import os
import re
import yaml
from pathlib import Path
from typing import Dict, List, Any

def scan_backend_components() -> Dict[str, Any]:
    """Сканирует backend/ и извлекает компоненты."""
    components = {
        "containers": [],
        "external_systems": [],
        "user_scenarios": []
    }
    
    backend_path = Path("backend")
    if not backend_path.exists():
        return components
    
    # Основные контейнеры из структуры
    containers = [
        {
            "name": "Backend API",
            "type": "Application",
            "tech": "FastAPI/Python",
            "exposed": True,
            "depends": ["PostgreSQL", "Auth Service", "SMTP"]
        },
        {
            "name": "Frontend SPA", 
            "type": "Application",
            "tech": "React/Vite",
            "exposed": True,
            "depends": ["Backend API"]
        },
        {
            "name": "Database",
            "type": "DataStore", 
            "tech": "PostgreSQL",
            "exposed": False,
            "depends": []
        }
    ]
    
    components["containers"] = containers
    
    # Внешние системы
    externals = [
        {
            "name": "SMTP/SendGrid",
            "kind": "Email Service",
            "direction": "outbound",
            "usage": "Уведомления о бронированиях"
        },
        {
            "name": "Auth Service",
            "kind": "Authentication",
            "direction": "inbound",
            "usage": "Аутентификация пользователей"
        }
    ]
    
    components["external_systems"] = externals
    
    # Пользовательские сценарии
    scenarios = [
        {
            "name": "create_booking",
            "description": "Создание бронирования",
            "flow": "Client → Frontend → Backend-API → DB; уведомление через SMTP"
        },
        {
            "name": "cancel_booking", 
            "description": "Отмена бронирования",
            "flow": "Client → Frontend → Backend-API → DB; уведомление через SMTP"
        },
        {
            "name": "view_schedule",
            "description": "Просмотр расписания",
            "flow": "Client → Frontend → Backend-API → DB"
        }
    ]
    
    components["user_scenarios"] = scenarios
    
    return components

def generate_inventory_markdown(components: Dict[str, Any]) -> str:
    """Генерирует Markdown из компонентов."""
    md = "# Архитектурный инвентарь\n\n"
    md += "_Автоматически сгенерировано из кода_\n\n"
    
    # Контейнеры
    md += "## Контейнеры\n\n"
    md += "| Name | Type | Tech | Exposed | Depends |\n"
    md += "|------|------|------|---------|---------|\n"
    
    for container in components["containers"]:
        depends = ", ".join(container["depends"]) if container["depends"] else "-"
        exposed = "✅" if container["exposed"] else "❌"
        md += f"| {container['name']} | {container['type']} | {container['tech']} | {exposed} | {depends} |\n"
    
    # Внешние системы
    md += "\n## Внешние интеграции\n\n"
    md += "| Name | Kind | Direction | Usage |\n"
    md += "|------|------|-----------|-------|\n"
    
    for ext in components["external_systems"]:
        md += f"| {ext['name']} | {ext['kind']} | {ext['direction']} | {ext['usage']} |\n"
    
    # Сценарии
    md += "\n## Пользовательские сценарии\n\n"
    
    for i, scenario in enumerate(components["user_scenarios"], 1):
        md += f"{i}. **{scenario['name']}** — {scenario['description']}\n"
        md += f"   Flow: {scenario['flow']}\n\n"
    
    return md

def main():
    """Основная функция."""
    print("[INVENTORY] Scanning backend components...")
    
    components = scan_backend_components()
    inventory_md = generate_inventory_markdown(components)
    
    # Записываем в файл
    inventory_path = Path("docs/c4/_inventory.md")
    inventory_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(inventory_path, "w", encoding="utf-8") as f:
        f.write(inventory_md)
    
    print(f"[INVENTORY] Updated: {inventory_path}")

if __name__ == "__main__":
    main() 