from fastapi import APIRouter, HTTPException
import httpx
import os
from typing import Optional
from urllib.parse import urlparse, parse_qs

router = APIRouter()

# API ключ Яндекс.Геокодера
YANDEX_API_KEY = "32d81139-8da9-4182-9f0a-ef47cfe6733f"

async def test_api_key():
    """
    Проверяет работоспособность API ключа
    """
    try:
        url = "https://geocode-maps.yandex.ru/1.x/"
        params = {
            "format": "json",
            "geocode": "37.617635,55.755814",
            "lang": "ru_RU",
            "apikey": YANDEX_API_KEY
        }
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, params=params)
            return response.status_code == 200
    except:
        return False

async def make_geocoder_request(params):
    """
    Выполняет запрос к геокодеру с API ключом
    """
    try:
        url = "https://geocode-maps.yandex.ru/1.x/"
        params_with_key = {**params, "apikey": YANDEX_API_KEY}
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params_with_key)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail="API ключ не работает. Для использования геокодера настройте ключ в Яндекс.Карты API."
            )
        else:
            raise HTTPException(status_code=500, detail=f"Ошибка геокодера: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при запросе к геокодеру: {str(e)}")

@router.get("/api-status")
async def get_api_status():
    """
    Проверяет статус API ключа
    """
    is_working = await test_api_key()
    return {
        "api_key": YANDEX_API_KEY,
        "is_working": is_working,
        "message": "API ключ работает" if is_working else "API ключ не работает. Настройте ключ в Яндекс.Карты API.",
        "fallback_available": False
    }

@router.get("/reverse-geocode")
async def reverse_geocode(lon: float, lat: float):
    """
    Выполняет обратное геокодирование по координатам
    """
    try:
        params = {
            "format": "json",
            "geocode": f"{lon},{lat}",
            "lang": "ru_RU"
        }
        
        data = await make_geocoder_request(params)
        feature_member = data['response']['GeoObjectCollection']['featureMember']
        
        if feature_member:
            address = feature_member[0]['GeoObject']['metaDataProperty']['GeocoderMetaData']['text']
            return {"success": True, "address": address}
        else:
            raise HTTPException(status_code=404, detail="Адрес не найден")
                
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при обратном геокодировании: {str(e)}")

@router.get("/geocode")
async def geocode_address(address: str):
    """
    Выполняет геокодирование адреса
    """
    try:
        params = {
            "format": "json",
            "geocode": address,
            "lang": "ru_RU"
        }
        
        data = await make_geocoder_request(params)
        feature_member = data['response']['GeoObjectCollection']['featureMember']
        
        if feature_member:
            geo_object = feature_member[0]['GeoObject']
            address_text = geo_object['metaDataProperty']['GeocoderMetaData']['text']
            coords = geo_object['Point']['pos'].split()
            
            return {
                "success": True,
                "address": address_text,
                "coordinates": {
                    "lon": float(coords[0]),
                    "lat": float(coords[1])
                }
            }
        else:
            raise HTTPException(status_code=404, detail="Адрес не найден")
                
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при геокодировании: {str(e)}")

@router.get("/extract-address-from-url")
async def extract_address_from_url(url: str):
    """
    Извлекает адрес из ссылки на Яндекс.Карты
    """
    try:
        # Проверяем, что это ссылка на Яндекс.Карты
        if not ('yandex.ru/maps' in url or 'maps.yandex.ru' in url):
            raise HTTPException(status_code=400, detail="Неверная ссылка на Яндекс.Карты")

        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        address = None
        coordinates = None

        # 1. Пытаемся извлечь адрес из параметра text
        if 'text' in query_params:
            address = query_params['text'][0]
        
        # 2. Пытаемся извлечь координаты
        if 'll' in query_params:
            coords = query_params['ll'][0].split(',')
            if len(coords) == 2:
                coordinates = [float(coords[0]), float(coords[1])]
        
        # 3. Пытаемся извлечь адрес из пути URL
        if not address:
            path_parts = parsed.path.split('/')
            if len(path_parts) >= 4:
                possible_address = path_parts[3]
                if (possible_address and 
                    possible_address not in ['moscow', 'spb', 'saint-petersburg'] and
                    not possible_address.isdigit() and
                    not possible_address.startswith('-/')):
                    address = possible_address
        
        # 4. Если есть координаты, используем обратное геокодирование
        if not address and coordinates:
            try:
                geocode_result = await reverse_geocode(coordinates[0], coordinates[1])
                if geocode_result.get("success"):
                    address = geocode_result["address"]
            except HTTPException as e:
                # Если API не работает, возвращаем ошибку с инструкцией
                if e.status_code == 403:
                    raise HTTPException(
                        status_code=403,
                        detail="Для извлечения адреса из координат нужен рабочий API ключ. Настройте ключ в Яндекс.Карты API."
                    )
                else:
                    raise e
        
        if address:
            return {"success": True, "address": address}
        else:
            raise HTTPException(status_code=404, detail="Не удалось извлечь адрес из ссылки")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке ссылки: {str(e)}") 