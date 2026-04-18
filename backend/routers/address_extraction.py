from fastapi import APIRouter, HTTPException
import httpx
import re
from bs4 import BeautifulSoup
from typing import Optional

router = APIRouter()

@router.get("/extract-address")
async def extract_address_from_yandex_link(url: str):
    """
    Извлекает адрес из ссылки на Яндекс.Карты, включая короткие ссылки
    """
    print(f"🔍 Получен запрос на извлечение адреса из URL: {url}")
    
    try:
        # Проверяем, что это ссылка на Яндекс.Карты
        if not ('yandex.ru/maps' in url or 'maps.yandex.ru' in url):
            print("❌ Неверная ссылка на Яндекс.Карты")
            raise HTTPException(status_code=400, detail="Неверная ссылка на Яндекс.Карты")

        # Извлекаем адрес из различных форматов ссылок
        print("🔧 Начинаем извлечение адреса...")
        address = await extract_address_from_url(url)
        
        if address:
            print(f"✅ Успешно извлечен адрес: {address}")
            return {"success": True, "address": address}
        else:
            print("❌ Не удалось извлечь адрес из ссылки")
            raise HTTPException(status_code=404, detail="Не удалось извлечь адрес из ссылки")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"💥 Ошибка при обработке ссылки: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке ссылки: {str(e)}")

async def extract_address_from_url(url: str) -> Optional[str]:
    """
    Извлекает адрес из URL Яндекс.Карт
    """
    # Проверяем, является ли это короткой ссылкой
    if '/maps/-/' in url:
        return await extract_address_from_short_link(url)
    else:
        return await extract_address_from_regular_link(url)

async def extract_address_from_regular_link(url: str) -> Optional[str]:
    """
    Извлекает адрес из обычной ссылки Яндекс.Карт
    """
    try:
        # Парсим URL
        from urllib.parse import urlparse, parse_qs
        
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        # 1. Пытаемся извлечь из параметра text
        if 'text' in query_params:
            address = query_params['text'][0]
            print(f"Извлечен адрес из параметра text: {address}")
            return address
        
        print(f"Параметры запроса: {query_params}")
        print(f"Путь URL: {parsed.path}")
        print(f"Части пути: {path_parts}")
        
        # 2. Пытаемся извлечь из пути URL
        path_parts = parsed.path.split('/')
        print(f"Разобранные части пути: {path_parts}")
        if len(path_parts) >= 4:
            possible_address = path_parts[3]
            if (possible_address and 
                possible_address not in ['moscow', 'spb', 'saint-petersburg'] and
                not possible_address.isdigit() and
                not possible_address.startswith('-/')):
                address = possible_address
                print(f"Извлечен адрес из пути URL: {address}")
                return address
        
        # 3. Если есть координаты, используем обратное геокодирование
        if 'll' in query_params:
            coords = query_params['ll'][0].split(',')
            if len(coords) == 2:
                print(f"Выполняем обратное геокодирование для координат: {coords[0]}, {coords[1]}")
                address = await reverse_geocode(coords[0], coords[1])
                if address:
                    print(f"Получен адрес через обратное геокодирование: {address}")
                    return address
        
        print("Не удалось извлечь адрес из ссылки")
        return None
    except Exception as e:
        print(f"Ошибка при извлечении адреса из обычной ссылки: {e}")
        return None

async def extract_address_from_short_link(short_url: str) -> Optional[str]:
    """
    Извлекает адрес из короткой ссылки через веб-скрапинг
    """
    print(f"🔍 Начинаем извлечение адреса из короткой ссылки: {short_url}")
    
    try:
        # Настройка заголовков для имитации браузера
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            print("📡 Отправляем запрос к Яндекс.Картам...")
            response = await client.get(short_url, headers=headers)
            response.raise_for_status()
            
            print(f"✅ Получен ответ: {response.status_code}")
            html = response.text
            print(f"📄 Размер HTML: {len(html)} символов")
            
            # Парсим HTML
            soup = BeautifulSoup(html, 'html.parser')
            
            # Ищем адрес в различных местах
            address = None
            
            # 1. Ищем в мета-тегах
            print("🔍 Поиск в мета-тегах...")
            meta_desc = soup.find('meta', property='og:description')
            if meta_desc and meta_desc.get('content'):
                content = meta_desc['content']
                print(f"📝 Найден og:description: {content}")
                match = re.search(r'адрес[:\s]+([^,]+)', content, re.IGNORECASE)
                if match:
                    address = match.group(1).strip()
                    print(f"✅ Извлечен адрес из og:description: {address}")
            
            # 2. Ищем в структурированных данных
            if not address:
                print("🔍 Поиск в структурированных данных...")
                scripts = soup.find_all('script', type='application/ld+json')
                for script in scripts:
                    try:
                        import json
                        data = json.loads(script.string)
                        if 'address' in data and 'streetAddress' in data['address']:
                            address = data['address']['streetAddress']
                            print(f"✅ Извлечен адрес из JSON-LD: {address}")
                            break
                    except:
                        continue
            
            # 3. Ищем в тексте страницы по ключевым словам
            if not address:
                print("🔍 Поиск в тексте страницы...")
                text_content = soup.get_text()
                patterns = [
                    r'адрес[:\s]+([^,\n]+)',
                    r'находится[:\s]+([^,\n]+)',
                    r'расположен[:\s]+([^,\n]+)',
                    r'([^,\n]+улица[^,\n]+)',
                    r'([^,\n]+проспект[^,\n]+)',
                    r'([^,\n]+переулок[^,\n]+)',
                ]
                
                for pattern in patterns:
                    match = re.search(pattern, text_content, re.IGNORECASE)
                    if match:
                        address = match.group(1).strip()
                        print(f"✅ Извлечен адрес из текста: {address}")
                        break
            
            # 4. Ищем в заголовках
            if not address:
                print("🔍 Поиск в заголовках...")
                headings = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
                for heading in headings:
                    text = heading.get_text()
                    if 'адрес' in text.lower():
                        next_element = heading.find_next_sibling()
                        if next_element and next_element.get_text():
                            address = next_element.get_text().strip()
                            print(f"✅ Извлечен адрес из заголовка: {address}")
                            break
            
            # 5. Ищем в карточке организации
            if not address:
                print("🔍 Поиск в карточке организации...")
                # Ищем элементы с классами, которые могут содержать адрес
                address_elements = soup.find_all(['div', 'span', 'p'], 
                                               class_=re.compile(r'address|адрес|location', re.IGNORECASE))
                for element in address_elements:
                    text = element.get_text().strip()
                    if text and len(text) > 10:  # Минимальная длина для адреса
                        address = text
                        print(f"✅ Извлечен адрес из карточки: {address}")
                        break
            
            if address:
                print(f"🎉 УСПЕХ: Найден адрес: {address}")
            else:
                print("❌ Адрес не найден")
            
            return address
            
    except Exception as e:
        print(f"💥 Ошибка при извлечении адреса из короткой ссылки: {e}")
        return None

async def reverse_geocode(lon: str, lat: str) -> Optional[str]:
    """
    Выполняет обратное геокодирование по координатам
    """
    try:
        import httpx
        
        url = f"https://geocode-maps.yandex.ru/1.x/"
        params = {
            "format": "json",
            "geocode": f"{lon},{lat}",
            "lang": "ru_RU"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            
            data = response.json()
            feature_member = data['response']['GeoObjectCollection']['featureMember']
            
            if feature_member:
                return feature_member[0]['GeoObject']['metaDataProperty']['GeocoderMetaData']['text']
        
        return None
    except Exception as e:
        print(f"Ошибка при обратном геокодировании: {e}")
        return None 