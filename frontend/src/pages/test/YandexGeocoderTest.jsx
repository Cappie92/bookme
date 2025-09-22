import React, { useState } from 'react';
import YandexGeocoder from '../../components/YandexGeocoder';
import YandexApiStatus from '../../components/YandexApiStatus';

const YandexGeocoderTest = () => {
    const [extractedAddress, setExtractedAddress] = useState('');

    const handleAddressExtracted = (address) => {
        setExtractedAddress(address);
        console.log('Извлеченный адрес:', address);
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-center mb-8">Тест YandexGeocoder</h1>
            
            <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4">Статус API ключа</h2>
                    <YandexApiStatus />
                </div>

                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4">Компонент YandexGeocoder</h2>
                    
                    <YandexGeocoder 
                        onAddressExtracted={handleAddressExtracted}
                        currentAddress={extractedAddress}
                    />
                </div>

                {extractedAddress && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold mb-3">Результат:</h3>
                        <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded-md">
                            <div className="font-medium mb-2">Извлеченный адрес:</div>
                            <div className="text-sm">{extractedAddress}</div>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-lg shadow-md p-6 mt-6">
                    <h3 className="text-lg font-semibold mb-3">Примеры ссылок для тестирования:</h3>
                    <div className="space-y-2 text-sm">
                        <div>
                            <strong>С параметром text (работает всегда):</strong>
                            <code className="block bg-gray-100 p-2 rounded mt-1">
                                https://yandex.ru/maps/213/moscow/?text=улица%20Тверская%2C%201
                            </code>
                        </div>
                        <div>
                            <strong>С координатами (требует API ключ):</strong>
                            <code className="block bg-gray-100 p-2 rounded mt-1">
                                https://yandex.ru/maps/213/moscow/?ll=37.617635,55.755814
                            </code>
                        </div>
                        <div>
                            <strong>С адресом в пути:</strong>
                            <code className="block bg-gray-100 p-2 rounded mt-1">
                                https://yandex.ru/maps/213/moscow/улица%20Тверская%2C%201
                            </code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default YandexGeocoderTest; 