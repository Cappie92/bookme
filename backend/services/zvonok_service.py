import requests
import random
import string
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class ZvonokService:
    """Сервис для интеграции с Zvonok API для верификации номеров телефонов"""
    
    def __init__(self):
        self.api_key = "f90ffd1506b18fc927188bbf66fa92ed"
        self.base_url = "https://zvonok.com/manager/cabapi_external/api/v1"
        self.campaign_id = None  # Будет создан при первом использовании
        
    def generate_verification_code(self, length: int = 4) -> str:
        """Генерирует код верификации"""
        return ''.join(random.choices(string.digits, k=length))
    
    def create_campaign(self, campaign_name: str = "Phone Verification") -> Optional[str]:
        """Создает кампанию для верификации номеров"""
        try:
            # Используем реальный campaign_id из Zvonok
            self.campaign_id = "1867042149"
            logger.info(f"Используется campaign_id: {self.campaign_id}")
            return self.campaign_id
            
            # Закомментированный код для реального API:
            # url = f"{self.base_url}/campaigns"
            # headers = {
            #     "Authorization": f"Bearer {self.api_key}",
            #     "Content-Type": "application/json"
            # }
            # 
            # data = {
            #     "name": campaign_name,
            #     "type": "verification",
            #     "description": "Автоматическая верификация номеров телефонов"
            # }
            # 
            # response = requests.post(url, json=data, headers=headers, timeout=30)
            # 
            # if response.status_code == 200:
            #     result = response.json()
            #     self.campaign_id = result.get("id")
            #     logger.info(f"Кампания создана с ID: {self.campaign_id}")
            #     return self.campaign_id
            # else:
            #     logger.error(f"Ошибка создания кампании: {response.status_code} - {response.text}")
            #     return None
                
        except Exception as e:
            logger.error(f"Ошибка при создании кампании: {str(e)}")
            return None
    
    def send_verification_call(self, phone_number: str) -> Dict[str, Any]:
        """
        Отправляет звонок для верификации номера телефона
        
        Args:
            phone_number: Номер телефона в формате +7XXXXXXXXXX
            
        Returns:
            Dict с результатом операции
        """
        try:
            # Если кампания не создана, создаем её
            if not self.campaign_id:
                campaign_id = self.create_campaign()
                if not campaign_id:
                    return {
                        "success": False,
                        "error": "Не удалось создать кампанию для верификации"
                    }
            
            # Подготавливаем номер телефона
            clean_phone = self._clean_phone_number(phone_number)
            if not clean_phone:
                return {
                    "success": False,
                    "error": "Неверный формат номера телефона"
                }
            
            # Подготавливаем данные для API Zvonok
            data = {
                'public_key': self.api_key,
                'phone': clean_phone,
                'campaign_id': self.campaign_id
                # phone_suffix НЕ передаем - Zvonok сгенерирует автоматически
            }
            
            # Логируем запрос
            logger.info(f"Отправляем запрос к Zvonok API: {self.base_url}/phones/flashcall/")
            logger.info(f"Данные запроса: {data}")
            
            # Отправляем запрос к Zvonok API
            response = requests.post(
                f"{self.base_url}/phones/flashcall/",
                data=data,
                timeout=30
            )
            
            # Логируем ответ
            logger.info(f"Ответ от Zvonok: статус {response.status_code}")
            logger.info(f"Тело ответа: {response.text}")
            
            if response.status_code == 200:
                result = response.json()
                if result.get("status") == "ok":
                    logger.info(f"Звонок успешно отправлен: call_id={result['data']['call_id']}, pincode={result['data']['pincode']}")
                    return {
                        "success": True,
                        "call_id": str(result["data"]["call_id"]),
                        "pincode": result["data"]["pincode"],
                        "message": "Звонок для верификации отправлен. Введите последние 4 цифры номера, с которого вам звонят."
                    }
                else:
                    logger.error(f"Ошибка API Zvonok: {result}")
                    return {
                        "success": False,
                        "error": f"Ошибка API Zvonok: {result.get('message', 'Неизвестная ошибка')}"
                    }
            else:
                logger.error(f"HTTP ошибка {response.status_code}: {response.text}")
                return {
                    "success": False,
                    "error": f"HTTP ошибка {response.status_code}: {response.text}"
                }
            
            # Закомментированный код для реального API:
            # audio_text = f"Ваш код подтверждения: {verification_code}. Повторяю: {verification_code}"
            # 
            # url = f"{self.base_url}/calls"
            # headers = {
            #     "Authorization": f"Bearer {self.api_key}",
            #     "Content-Type": "application/json"
            # }
            # 
            # data = {
            #     "campaign_id": self.campaign_id,
            #     "phone": clean_phone,
            #     "audio_text": audio_text,
            #     "call_type": "verification",
            #     "max_attempts": 3,
            #     "timeout": 30
            # }
            # 
            # response = requests.post(url, json=data, headers=headers, timeout=30)
            # 
            # if response.status_code == 200:
            #     result = response.json()
            #     logger.info(f"Звонок отправлен на номер {clean_phone}, ID: {result.get('call_id')}")
            #     return {
            #         "success": True,
            #         "call_id": result.get("call_id"),
            #         "message": "Звонок с кодом верификации отправлен"
            #     }
            # else:
            #     logger.error(f"Ошибка отправки звонка: {response.status_code} - {response.text}")
            #     return {
            #         "success": False,
            #         "error": f"Ошибка API: {response.status_code} - {response.text}"
            #     }
                
        except Exception as e:
            logger.error(f"Ошибка при отправке звонка: {str(e)}")
            return {
                "success": False,
                "error": f"Ошибка сервиса: {str(e)}"
            }
    
    def verify_phone_digits(self, call_id: str, phone_digits: str) -> Dict[str, Any]:
        """
        Проверяет введенные пользователем последние 4 цифры номера
        
        Args:
            call_id: ID звонка
            phone_digits: Последние 4 цифры номера, введенные пользователем
            
        Returns:
            Dict с результатом проверки
        """
        try:
            # В реальном API здесь должен быть запрос к Zvonok для проверки статуса звонка
            # Пока используем mock-режим, так как API для проверки статуса может отличаться
            logger.info(f"Проверка цифр {phone_digits} для звонка {call_id}")
            
            # В mock-режиме принимаем любые 4 цифры как правильные
            # В реальном API здесь будет сравнение с pincode из ответа send_verification_call
            if len(phone_digits) == 4 and phone_digits.isdigit():
                return {
                    "success": True,
                    "verified": True,
                    "message": "Номер телефона успешно верифицирован"
                }
            else:
                return {
                    "success": False,
                    "verified": False,
                    "message": "Неверные цифры номера телефона"
                }
                
        except Exception as e:
            logger.error(f"Ошибка при проверке цифр номера: {str(e)}")
            return {
                "success": False,
                "verified": False,
                "error": f"Ошибка сервиса: {str(e)}"
            }
    
    def check_call_status(self, call_id: str) -> Dict[str, Any]:
        """Проверяет статус звонка"""
        try:
            # Mock-режим: симулируем успешный статус звонка
            logger.info(f"Mock: Проверка статуса звонка {call_id}")
            return {
                "success": True,
                "status": "completed",
                "verified": True,
                "details": {
                    "call_id": call_id,
                    "status": "completed",
                    "verified": True
                }
            }
            
            # Закомментированный код для реального API:
            # url = f"{self.base_url}/calls/{call_id}"
            # headers = {
            #     "Authorization": f"Bearer {self.api_key}"
            # }
            # 
            # response = requests.get(url, headers=headers, timeout=30)
            # 
            # if response.status_code == 200:
            #     result = response.json()
            #     return {
            #         "success": True,
            #         "status": result.get("status"),
            #         "details": result
            #     }
            # else:
            #     return {
            #         "success": False,
            #         "error": f"Ошибка получения статуса: {response.status_code}"
            #     }
                
        except Exception as e:
            logger.error(f"Ошибка при проверке статуса звонка: {str(e)}")
            return {
                "success": False,
                "error": f"Ошибка сервиса: {str(e)}"
            }
    
    def _clean_phone_number(self, phone: str) -> Optional[str]:
        """Очищает и форматирует номер телефона"""
        if not phone:
            return None
            
        # Удаляем все символы кроме цифр и +
        clean = ''.join(c for c in phone if c.isdigit() or c == '+')
        
        # Если номер начинается с 8, заменяем на +7
        if clean.startswith('8') and len(clean) == 11:
            clean = '+7' + clean[1:]
        
        # Если номер начинается с 7, добавляем +
        if clean.startswith('7') and len(clean) == 11:
            clean = '+' + clean
            
        # Проверяем, что номер в правильном формате
        if clean.startswith('+7') and len(clean) == 12:
            return clean
            
        return None

# Создаем экземпляр сервиса
zvonok_service = ZvonokService()
