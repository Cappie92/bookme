#!/usr/bin/env python3
"""
Генератор системного обзора из архитектурного инвентаря.
Создает docs/system_overview.md с автоматически генерируемым содержимым.
"""

import re
from pathlib import Path
from typing import Dict, List, Any

def parse_inventory_markdown(inventory_path: Path) -> Dict[str, Any]:
    """Парсит _inventory.md и извлекает компоненты."""
    if not inventory_path.exists():
        print(f"[ERROR] Inventory file not found: {inventory_path}")
        return {}
    
    with open(inventory_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    components = {
        "containers": [],
        "external_systems": [],
        "user_scenarios": []
    }
    
    # Парсим таблицу контейнеров
    container_section = re.search(r'## Контейнеры\n\n(.*?)\n\n##', content, re.DOTALL)
    if container_section:
        table_lines = container_section.group(1).strip().split('\n')[2:]  # Пропускаем заголовки
        for line in table_lines:
            if line.strip() and '|' in line:
                parts = [p.strip() for p in line.split('|')[1:-1]]  # Убираем пустые части
                if len(parts) >= 5:
                    components["containers"].append({
                        "name": parts[0],
                        "type": parts[1], 
                        "tech": parts[2],
                        "exposed": parts[3] == "✅",
                        "depends": parts[4] if parts[4] != "-" else ""
                    })
    
    # Парсим внешние системы
    external_section = re.search(r'## Внешние интеграции\n\n(.*?)\n\n##', content, re.DOTALL)
    if external_section:
        table_lines = external_section.group(1).strip().split('\n')[2:]
        for line in table_lines:
            if line.strip() and '|' in line:
                parts = [p.strip() for p in line.split('|')[1:-1]]
                if len(parts) >= 4:
                    components["external_systems"].append({
                        "name": parts[0],
                        "kind": parts[1],
                        "direction": parts[2],
                        "usage": parts[3]
                    })
    
    # Парсим сценарии
    scenario_section = re.search(r'## Пользовательские сценарии\n\n(.*?)(?=\n\n##|\Z)', content, re.DOTALL)
    if scenario_section:
        scenario_text = scenario_section.group(1)
        scenario_matches = re.findall(r'(\d+)\. \*\*(.*?)\*\* — (.*?)\n\s*Flow: (.*?)(?=\n\n|\Z)', scenario_text, re.DOTALL)
        for match in scenario_matches:
            components["user_scenarios"].append({
                "name": match[1],
                "description": match[2],
                "flow": match[3].strip()
            })
    
    return components

def generate_system_overview(components: Dict[str, Any]) -> str:
    """Генерирует содержимое system_overview.md."""
    md = "# System overview\n\n"
    md += "<!-- BEGIN:AUTOGEN_OVERVIEW -->\n"
    md += "_Секция ниже генерируется автоматически из C4-инвентаря; не редактируйте вручную._\n\n"
    
    # Контейнеры
    md += "## Контейнеры\n"
    md += "| Name | Type | Tech | Exposed | Depends |\n"
    md += "|------|------|------|---------|---------|\n"
    
    for container in components.get("containers", []):
        depends = container["depends"] if container["depends"] else "-"
        exposed = "✅" if container["exposed"] else "❌"
        md += f"| {container['name']} | {container['type']} | {container['tech']} | {exposed} | {depends} |\n"
    
    # Внешние интеграции
    md += "\n## Внешние интеграции\n"
    md += "| Name | Kind | Direction | Usage |\n"
    md += "|------|------|-----------|-------|\n"
    
    for ext in components.get("external_systems", []):
        md += f"| {ext['name']} | {ext['kind']} | {ext['direction']} | {ext['usage']} |\n"
    
    # Пользовательские сценарии
    md += "\n## Основные пользовательские сценарии\n"
    
    for i, scenario in enumerate(components.get("user_scenarios", []), 1):
        md += f"{i}. **{scenario['name']}** — {scenario['description']}\n"
        md += f"   {scenario['flow']}\n\n"
    
    md += "<!-- END:AUTOGEN_OVERVIEW -->\n\n"
    
    # Секция для ручного редактирования
    md += "## Notes (редактируйте свободно)\n"
    md += "– Здесь можно писать дополнительные комментарии, ссылки, RFC …\n"
    
    return md

def update_system_overview_file(overview_content: str, overview_path: Path):
    """Обновляет файл system_overview.md, сохраняя ручную секцию."""
    if overview_path.exists():
        # Читаем существующий файл
        with open(overview_path, "r", encoding="utf-8") as f:
            existing_content = f.read()
        
        # Извлекаем ручную секцию
        manual_section_match = re.search(r'<!-- END:AUTOGEN_OVERVIEW -->\n\n(.*)', existing_content, re.DOTALL)
        if manual_section_match:
            manual_section = manual_section_match.group(1)
            # Заменяем только автоматическую часть
            new_content = re.sub(
                r'<!-- BEGIN:AUTOGEN_OVERVIEW -->.*?<!-- END:AUTOGEN_OVERVIEW -->',
                overview_content.split('<!-- END:AUTOGEN_OVERVIEW -->')[0] + '<!-- END:AUTOGEN_OVERVIEW -->',
                existing_content,
                flags=re.DOTALL
            )
            overview_content = new_content + '\n' + manual_section
    
    # Записываем файл
    overview_path.parent.mkdir(parents=True, exist_ok=True)
    with open(overview_path, "w", encoding="utf-8") as f:
        f.write(overview_content)

def main():
    """Основная функция."""
    inventory_path = Path("docs/c4/_inventory.md")
    overview_path = Path("docs/system_overview.md")
    
    print("[OVERVIEW] Parsing inventory...")
    components = parse_inventory_markdown(inventory_path)
    
    if not components:
        print("[ERROR] Failed to parse inventory components")
        return
    
    print("[OVERVIEW] Generating system overview...")
    overview_content = generate_system_overview(components)
    
    update_system_overview_file(overview_content, overview_path)
    
    print(f"[OVERVIEW] Updated: {overview_path}")

if __name__ == "__main__":
    main() 