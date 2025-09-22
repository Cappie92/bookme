import httpx
from typing import Optional, Dict, Any
import os
from datetime import datetime, timedelta

class PlusofonService:
    """Сервис для работы с Plusofon API"""
    
    def __init__(self):
        self.user_id = os.getenv('PLUSOFON_USER_ID', '3545')
        self.access_token = os.getenv('PLUSOFON_ACCESS_TOKEN', '4AbOVVSDrEB6sGb6Ib52VyTHEfsHzfcfJ3F5')
        self.base_url = 'https://restapi.plusofon.ru'
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def initiate_call(self, phone: str, code: str) -> Dict[str, Any]:
        """
        Инициирует звонок с кодом верификации
        
        Args:
            phone: Номер телефона в формате +7XXXXXXXXXX
            code: Код верификации для произношения
            
        Returns:
            Dict с результатом операции
        """
        if not self.access_token:
            raise ValueError("PLUSOFON_ACCESS_TOKEN не настроен")
        
        try:
            # Убираем +7 и добавляем 8 для российских номеров
            clean_phone = phone.replace('+7', '8')
            
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Client": self.user_id,
                "Authorization": f"Bearer {self.access_token}"
            }
            
            payload = {
                "phone": clean_phone,
                "pin": code,
                "lang": "ru",  # Язык произношения
                "repeat": 2,   # Количество повторов кода
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/flash-call/call",
                headers=headers,
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {
                        "success": True,
                        "call_id": data.get("data", {}).get("call_id"),
                        "message": "Звонок инициирован"
                    }
                else:
                    return {
                        "success": False,
                        "message": data.get("message", "Неизвестная ошибка")
                    }
            else:
                return {
                    "success": False,
                    "message": f"Ошибка API: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Ошибка инициации звонка: {str(e)}"
            }
    
    async def check_call_status(self, call_id: str) -> Dict[str, Any]:
        """
        Проверяет статус звонка
        
        Args:
            call_id: ID звонка
            
        Returns:
            Dict с статусом звонка
        """
        if not self.access_token:
            raise ValueError("PLUSOFON_ACCESS_TOKEN не настроен")
        
        try:
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Client": self.user_id,
                "Authorization": f"Bearer {self.access_token}"
            }
            
            payload = {
                "call_id": call_id
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/flash-call/status",
                headers=headers,
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {
                        "success": True,
                        "status": data.get("data", {}).get("status"),
                        "message": data.get("data", {}).get("message", "")
                    }
                else:
                    return {
                        "success": False,
                        "message": data.get("message", "Неизвестная ошибка")
                    }
            else:
                return {
                    "success": False,
                    "message": f"Ошибка API: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Ошибка проверки статуса: {str(e)}"
            }
    
    async def get_balance(self) -> Dict[str, Any]:
        """
        Получает баланс аккаунта
        
        Returns:
            Dict с информацией о балансе
        """
        if not self.access_token:
            raise ValueError("PLUSOFON_ACCESS_TOKEN не настроен")
        
        try:
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Client": self.user_id,
                "Authorization": f"Bearer {self.access_token}"
            }
            
            response = await self.client.get(
                f"{self.base_url}/api/v1/flash-call",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    # Получаем информацию об аккаунтах
                    accounts = data.get("data", [])
                    if accounts:
                        # Возвращаем информацию о первом аккаунте
                        account = accounts[0]
                        return {
                            "success": True,
                            "account_id": account.get("id"),
                            "account_name": account.get("name"),
                            "access_token": account.get("access_token")
                        }
                    else:
                        return {
                            "success": False,
                            "message": "Аккаунты не найдены"
                        }
                else:
                    return {
                        "success": False,
                        "message": data.get("message", "Неизвестная ошибка")
                    }
            else:
                return {
                    "success": False,
                    "message": f"Ошибка API: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Ошибка получения баланса: {str(e)}"
            }
    
    async def initiate_reverse_flashcall(self, phone: str, code: str) -> Dict[str, Any]:
        """
        Инициирует обратный FlashCall (пользователь звонит на номер Plusofon)
        
        Args:
            phone: Номер телефона в формате +7XXXXXXXXXX
            code: Код верификации для проверки
            
        Returns:
            Dict с результатом операции
        """
        if not self.access_token:
            raise ValueError("PLUSOFON_ACCESS_TOKEN не настроен")
        
        try:
            # Убираем +7 и добавляем 8 для российских номеров
            clean_phone = phone.replace('+7', '8')
            
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Client": self.user_id,
                "Authorization": f"Bearer {self.access_token}"
            }
            
            payload = {
                "phone": clean_phone,
                "pin": code,
                "lang": "ru",  # Язык произношения
                "reverse": True,  # Флаг для обратного FlashCall
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/flash-call/reverse",
                headers=headers,
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {
                        "success": True,
                        "call_id": data.get("data", {}).get("call_id"),
                        "verification_number": data.get("data", {}).get("verification_number"),
                        "message": "Обратный FlashCall инициирован"
                    }
                else:
                    return {
                        "success": False,
                        "message": data.get("message", "Неизвестная ошибка")
                    }
            else:
                return {
                    "success": False,
                    "message": f"Ошибка API: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Ошибка инициации обратного FlashCall: {str(e)}"
            }
    
    async def check_reverse_flashcall_status(self, call_id: str) -> Dict[str, Any]:
        """
        Проверяет статус обратного FlashCall
        
        Args:
            call_id: ID звонка
            
        Returns:
            Dict с статусом звонка
        """
        if not self.access_token:
            raise ValueError("PLUSOFON_ACCESS_TOKEN не настроен")
        
        try:
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Client": self.user_id,
                "Authorization": f"Bearer {self.access_token}"
            }
            
            payload = {
                "call_id": call_id
            }
            
            response = await self.client.post(
                f"{self.base_url}/api/v1/flash-call/reverse/status",
                headers=headers,
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return {
                        "success": True,
                        "status": data.get("data", {}).get("status"),
                        "verified": data.get("data", {}).get("verified", False),
                        "message": data.get("data", {}).get("message", "")
                    }
                else:
                    return {
                        "success": False,
                        "message": data.get("message", "Неизвестная ошибка")
                    }
            else:
                return {
                    "success": False,
                    "message": f"Ошибка API: {response.status_code}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Ошибка проверки статуса обратного FlashCall: {str(e)}"
            }
    
    async def close(self):
        """Закрывает HTTP клиент"""
        await self.client.aclose()

# Глобальный экземпляр сервиса
plusofon_service = PlusofonService() 