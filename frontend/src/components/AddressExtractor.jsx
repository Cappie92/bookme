import React, { useState } from 'react';

const AddressExtractor = ({ onAddressExtracted, currentAddress = '' }) => {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [extractedAddress, setExtractedAddress] = useState('');

    const extractAddressFromUrl = async (inputUrl) => {
        setLoading(true);
        setError('');
        setExtractedAddress('');

        try {
            // Проверяем, что это ссылка на Яндекс.Карты
            if (!inputUrl.includes('yandex.ru/maps') && !inputUrl.includes('maps.yandex.ru')) {
                throw new Error('Пожалуйста, вставьте ссылку на Яндекс.Карты');
            }

            // Используем наш серверный API через прокси Vite
            const response = await fetch(
                `/api/geocoder/extract-address-from-url?url=${encodeURIComponent(inputUrl)}`,
                {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                    }
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Ошибка при извлечении адреса');
            }

            const data = await response.json();
            
            if (data.success) {
                setExtractedAddress(data.address);
                onAddressExtracted(data.address);
            } else {
                throw new Error('Не удалось извлечь адрес из ссылки');
            }

        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (url.trim()) {
            extractAddressFromUrl(url.trim());
        }
    };

    const handleUseExtractedAddress = () => {
        if (extractedAddress) {
            onAddressExtracted(extractedAddress);
            setUrl('');
            setExtractedAddress('');
        }
    };

    return (
        <div className="bg-gray-50 p-4 rounded-lg border">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
                Извлечь адрес из ссылки Яндекс.Карт
            </h4>
            
            <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                    <label htmlFor="yandex-url" className="block text-xs text-gray-600 mb-1">
                        Ссылка на Яндекс.Карты
                    </label>
                    <input
                        type="url"
                        id="yandex-url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://yandex.ru/maps/..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 text-white py-2 px-3 text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Извлечение...' : 'Извлечь адрес'}
                </button>
            </form>

            {error && (
                <div className="mt-3 p-2 bg-red-100 border border-red-400 text-red-700 text-xs rounded-md">
                    {error}
                </div>
            )}

            {extractedAddress && (
                <div className="mt-3 p-3 bg-green-100 border border-green-400 text-green-700 rounded-md">
                    <div className="text-xs font-medium mb-2">Извлеченный адрес:</div>
                    <div className="text-sm mb-3">{extractedAddress}</div>
                    <button
                        onClick={handleUseExtractedAddress}
                        className="bg-green-600 text-white py-1 px-3 text-xs rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                        Использовать этот адрес
                    </button>
                </div>
            )}

            <div className="mt-3 text-xs text-gray-600">
                <div className="font-medium mb-1">Поддерживаемые форматы:</div>
                <ul className="list-disc list-inside space-y-1">
                    <li>Ссылки с параметром text</li>
                    <li>Ссылки с координатами</li>
                    <li>Короткие ссылки (ограниченно)</li>
                </ul>
            </div>
        </div>
    );
};

export default AddressExtractor; 