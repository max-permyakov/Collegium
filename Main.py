import asyncio
import httpx
import os
import sys
import json
from dotenv import load_dotenv

async def main():
    # Создаем клиент, который автоматически сохраняет куки (сессию)
    async with httpx.AsyncClient(verify=False) as client:
        # 1. Заголовки, чтобы сервер принял нас за обычный браузер
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
        }
        load_dotenv()
        login = os.getenv("LOGIN")
        password = os.getenv("PASSWORD")
        # 2. Полезная нагрузка (тело запроса), которую вы нашли
        login_data = {
            'login': login,
            # Вставьте сюда ту строку пароля, которую перехватили в браузере
            'password': password,
            'isRemember': False,
        }

        print('Vypolnyayu vkhod...')
        response = await client.post(
            'https://spo.rso23.ru/services/security/login',
            json=login_data,
            headers=headers,
        )

        # Проверяем статус ответа (ожидаем 200 OK)
        if response.status_code == 200:
            print('Vhod uspeshno vypolnen!')
            # Выводим ответ сервера — там должен быть JSON с данными пользователя или токеном
            data = response.json()
            with open('login_response.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print('Otvet servera sohranen v login_response.json')
            print('Cookies:', dict(client.cookies))

            # Получить studentId из ответа
            student_id = None
            if 'tenants' in data:
                for tenant_key, tenant_data in data['tenants'].items():
                    if 'studentRole' in tenant_data and 'id' in tenant_data['studentRole']:
                        student_id = tenant_data['studentRole']['id']
                        break
            
            if student_id:
                print(f'Student ID: {student_id}')
                
                # 3. Получить расписание на неделю
                from datetime import datetime, timedelta
                start_date = datetime.now().strftime('%Y-%m-%d')
                end_date = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
                
                print(f'Poluchayu raspisanie s {start_date} po {end_date}...')
                schedule_response = await client.get(
                    f'https://spo.rso23.ru/services/students/{student_id}/lessons/{start_date}/{end_date}',
                    headers=headers,
                )
                with open('schedule_response.json', 'w', encoding='utf-8') as f:
                    json.dump(schedule_response.json(), f, ensure_ascii=False, indent=2)
                print('Raspisanie sohraneno v schedule_response.json')
                print(f'Status: {schedule_response.status_code}')
                
                # 4. Получить dashboard (средние оценки)
                print('Poluchayu dashboard...')
                dashboard_response = await client.get(
                    f'https://spo.rso23.ru/services/students/{student_id}/dashboard',
                    headers=headers,
                )
                with open('dashboard_response.json', 'w', encoding='utf-8') as f:
                    json.dump(dashboard_response.json(), f, ensure_ascii=False, indent=2)
                print('Dashboard sohranen v dashboard_response.json')
                print(f'Status: {dashboard_response.status_code}')
                
                # 5. Получить детальную успеваемость
                print('Poluchayu performance...')
                performance_response = await client.get(
                    f'https://spo.rso23.ru/services/reports/current/performance/{student_id}',
                    headers=headers,
                )
                with open('performance_response.json', 'w', encoding='utf-8') as f:
                    json.dump(performance_response.json(), f, ensure_ascii=False, indent=2)
                print('Performance sohranen v performance_response.json')
                print(f'Status: {performance_response.status_code}')
                
                # 6. Получить account settings
                print('Poluchayu account settings...')
                account_response = await client.get(
                    'https://spo.rso23.ru/services/security/account-settings',
                    headers=headers,
                )
                with open('account_settings_response.json', 'w', encoding='utf-8') as f:
                    json.dump(account_response.json(), f, ensure_ascii=False, indent=2)
                print('Account settings sohranen v account_settings_response.json')
                print(f'Status: {account_response.status_code}')
            else:
                print('Student ID ne nayden v otvete!')

        else:
            print(f'Oshibka vkhoda! Status: {response.status_code}')
            print('Tekst oshibki:', response.text)


if __name__ == '__main__':
    # Запуск асинхронного кода
    asyncio.run(main())
