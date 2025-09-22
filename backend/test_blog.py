import requests
import json

# Базовый URL API
BASE_URL = "http://localhost:8000"

# Данные для авторизации админа
admin_credentials = {
    "phone": "+79999999999",
    "password": "1JaK999myproject"
}

def login_admin():
    """Авторизация админа"""
    response = requests.post(f"{BASE_URL}/auth/login", json=admin_credentials)
    if response.status_code == 200:
        data = response.json()
        return data["access_token"]
    else:
        print(f"Ошибка авторизации: {response.status_code}")
        return None

def create_test_post(token):
    """Создание тестовой статьи"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    test_post = {
        "title": "Как выбрать хорошего мастера для стрижки",
        "subtitle": "Полезные советы для клиентов салонов красоты",
        "excerpt": "Узнайте, на что обратить внимание при выборе мастера для стрижки. Советы экспертов помогут вам найти профессионала.",
        "author_id": 1,  # ID админа
        "content": """
        <h2>Введение</h2>
        <p>Выбор хорошего мастера для стрижки - это важный шаг, который может повлиять на ваш внешний вид на несколько недель вперед. В этой статье мы расскажем, как найти профессионала, который создаст идеальную стрижку именно для вас.</p>
        
        <h2>Опыт и квалификация</h2>
        <p>Первое, на что стоит обратить внимание - это опыт мастера. Опытный специалист знает различные техники стрижки и может адаптировать их под особенности ваших волос и форму лица.</p>
        
        <h2>Портфолио работ</h2>
        <p>Обязательно посмотрите портфолио мастера. Это поможет понять его стиль и уровень мастерства. Обратите внимание на разнообразие работ и качество исполнения.</p>
        
        <h2>Отзывы клиентов</h2>
        <p>Читайте отзывы других клиентов. Они могут рассказать о том, как мастер работает с разными типами волос и насколько внимательно относится к пожеланиям клиентов.</p>
        
        <h2>Консультация перед стрижкой</h2>
        <p>Хороший мастер всегда проведет консультацию перед началом работы. Он расспросит о ваших предпочтениях, образе жизни и уходе за волосами.</p>
        
        <h2>Заключение</h2>
        <p>Правильный выбор мастера - это инвестиция в ваш внешний вид и самооценку. Не торопитесь с выбором и доверяйте только профессионалам.</p>
        """,
        "tags": ["стрижка", "мастер", "салон красоты", "советы"],
        "meta_title": "Как выбрать хорошего мастера для стрижки - советы экспертов",
        "meta_description": "Узнайте, как выбрать опытного мастера для стрижки. Советы по выбору профессионала, на что обратить внимание при выборе салона красоты.",
        "og_title": "Как выбрать хорошего мастера для стрижки",
        "og_description": "Полезные советы для выбора профессионального мастера по стрижке волос",
        "twitter_title": "Как выбрать мастера для стрижки",
        "twitter_description": "Экспертные советы по выбору профессионального мастера по стрижке"
    }
    
    response = requests.post(f"{BASE_URL}/admin/blog/posts", headers=headers, json=test_post)
    
    if response.status_code == 200:
        print("✅ Тестовая статья создана успешно!")
        post_data = response.json()
        print(f"ID статьи: {post_data['id']}")
        print(f"Slug: {post_data['slug']}")
        print(f"SEO оценка: {post_data['seo_score']}%")
        print(f"Количество слов: {post_data['word_count']}")
        print(f"Время чтения: {post_data['reading_time']} мин")
        return post_data['id']
    else:
        print(f"❌ Ошибка создания статьи: {response.status_code}")
        print(response.text)
        return None

def publish_post(token, post_id):
    """Публикация статьи"""
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    response = requests.post(f"{BASE_URL}/admin/blog/posts/{post_id}/publish", headers=headers)
    
    if response.status_code == 200:
        print("✅ Статья опубликована успешно!")
        data = response.json()
        print(f"Ping результаты: {data.get('ping_results', {})}")
    else:
        print(f"❌ Ошибка публикации: {response.status_code}")
        print(response.text)

def get_posts(token):
    """Получение списка статей"""
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    response = requests.get(f"{BASE_URL}/admin/blog/posts", headers=headers)
    
    if response.status_code == 200:
        posts = response.json()
        print(f"✅ Найдено статей: {len(posts)}")
        for post in posts:
            print(f"- {post['title']} ({post['status']}) - SEO: {post['seo_score']}%")
    else:
        print(f"❌ Ошибка получения статей: {response.status_code}")

def get_tags(token):
    """Получение тегов"""
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    response = requests.get(f"{BASE_URL}/admin/blog/tags", headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Найдено тегов: {len(data['tags'])}")
        print(f"Теги: {', '.join(data['tags'])}")
    else:
        print(f"❌ Ошибка получения тегов: {response.status_code}")

def main():
    print("🚀 Тестирование блог-функционала...")
    
    # Авторизация
    token = login_admin()
    if not token:
        return
    
    print("✅ Авторизация успешна")
    
    # Создание тестовой статьи
    post_id = create_test_post(token)
    if post_id:
        # Публикация статьи
        publish_post(token, post_id)
        
        # Получение списка статей
        get_posts(token)
        
        # Получение тегов
        get_tags(token)
    
    print("✅ Тестирование завершено!")

if __name__ == "__main__":
    main() 