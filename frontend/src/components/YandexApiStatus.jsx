import React, { useState, useEffect } from 'react';

const YandexApiStatus = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkApiStatus();
    }, []);

    const checkApiStatus = async () => {
        try {
            const response = await fetch('/api/geocoder/api-status');
            const data = await response.json();
            setStatus(data);
        } catch {
            setStatus({
                api_key: '32d81139-8da9-4182-9f0a-ef47cfe6733f',
                is_working: false,
                message: 'Ошибка при проверке API'
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-blue-50 p-3 rounded-md">
                <div className="text-sm text-blue-700">Проверка статуса API...</div>
            </div>
        );
    }

    return (
        <div className={`p-3 rounded-md ${status?.is_working ? 'bg-green-50' : 'bg-yellow-50'}`}>
            <div className="flex items-center justify-between">
                <div>
                    <div className={`text-sm font-medium ${status?.is_working ? 'text-green-700' : 'text-yellow-700'}`}>
                        {status?.is_working ? '✅ API ключ работает' : '⚠️ API ключ не работает'}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                        {status?.message}
                    </div>
                </div>
                <button
                    onClick={checkApiStatus}
                    className="text-xs bg-white px-2 py-1 rounded border hover:bg-gray-50"
                >
                    Обновить
                </button>
            </div>
            
            {!status?.is_working && (
                <div className="mt-3 text-xs text-yellow-700">
                    <div className="font-medium mb-1">Для полного функционала настройте API ключ:</div>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>Перейдите в <a href="https://yandex.ru/dev/maps/" target="_blank" rel="noopener noreferrer" className="underline">Яндекс.Карты API</a></li>
                        <li>Найдите ключ: <code className="bg-gray-200 px-1 rounded">{status?.api_key}</code></li>
                        <li>Добавьте HTTP-рефереры: <code className="bg-gray-200 px-1 rounded">localhost</code>, <code className="bg-gray-200 px-1 rounded">127.0.0.1</code></li>
                        <li>Добавьте IP-адреса: <code className="bg-gray-200 px-1 rounded">127.0.0.1</code>, <code className="bg-gray-200 px-1 rounded">::1</code></li>
                    </ol>
                </div>
            )}
        </div>
    );
};

export default YandexApiStatus; 