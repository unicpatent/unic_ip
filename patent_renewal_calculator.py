#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
파이썬 특허 연차료 계산 시스템
KIPRIS 3API를 활용한 등록특허 정보 조회 및 연차료 계산

사용법:
python patent_renewal_calculator.py
"""

import os
import sys
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta1
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
import json
import csv
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv()

@dataclass
class PatentInfo:
    """특허 정보 데이터 클래스"""
    application_number: str
    registration_number: str
    applicant_name: str
    registration_date: str
    invention_title: str
    claim_count: str
    expiration_date: str

@dataclass  
class RenewalFeeInfo:
    """연차료 정보 데이터 클래스"""
    due_date: str
    year_number: str
    fee_amount: str
    status: str
    next_year_request: str
    late_payment_period: str
    recovery_period: str

class KiprisAPIClient:
    """KIPRIS API 클라이언트"""
    
    def __init__(self):
        self.api_key = os.getenv('KIPRIS_API_KEY')
        self.base_url = os.getenv('KIPRIS_API_BASE_URL')
        
        if not self.api_key or not self.base_url:
            print("❌ 환경변수 설정이 필요합니다:")
            print("   KIPRIS_API_KEY와 KIPRIS_API_BASE_URL을 .env 파일에 설정해주세요.")
            sys.exit(1)
            
        print(f"🔧 KIPRIS API 클라이언트 초기화 완료")
        print(f"   Base URL: {self.base_url}")
        print(f"   API Key: {'설정됨' if self.api_key else '설정 안됨'}")

    def search_registered_patents(self, customer_number: str) -> List[PatentInfo]:
        """등록특허 검색"""
        try:
            url = f"{self.base_url}/patUtiModInfoSearchSevice/getWordSearch"
            params = {
                'word': customer_number,
                'ServiceKey': self.api_key,
                'numOfRows': 100,
                'pageNo': 1
            }
            
            print(f"🔍 KIPRIS API 호출: {customer_number}")
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            print(f"📡 API 응답 수신: {response.status_code}")
            patents = self._parse_xml_response(response.text)
            
            # 등록번호가 있는 특허만 필터링
            registered_patents = [p for p in patents if p.registration_number and p.registration_number != '-']
            
            print(f"📋 등록특허 {len(registered_patents)}건 발견")
            return registered_patents
            
        except requests.exceptions.RequestException as e:
            print(f"❌ API 호출 오류: {e}")
            return []
        except Exception as e:
            print(f"❌ 처리 오류: {e}")
            return []

    def _parse_xml_response(self, xml_data: str) -> List[PatentInfo]:
        """XML 응답 파싱"""
        patents = []
        
        try:
            root = ET.fromstring(xml_data)
            items = root.findall('.//item')
            
            for item in items:
                patent = PatentInfo(
                    application_number=self._get_text_value(item.find('applicationNumber')),
                    registration_number=self._get_text_value(item.find('registerNumber')),
                    applicant_name=self._get_text_value(item.find('applicantName')),
                    registration_date=self._format_date(self._get_text_value(item.find('registerDate'))),
                    invention_title=self._get_text_value(item.find('inventionTitle')),
                    claim_count=self._get_text_value(item.find('claimCount')),
                    expiration_date=self._format_date(self._get_text_value(item.find('rightDuration')))
                )
                patents.append(patent)
                
        except ET.ParseError as e:
            print(f"❌ XML 파싱 오류: {e}")
        
        return patents

    def _get_text_value(self, element) -> str:
        """XML 요소에서 텍스트 값 추출"""
        if element is not None and element.text:
            return element.text.strip()
        return '-'

    def _format_date(self, date_str: str) -> str:
        """날짜 포맷 변환 (YYYYMMDD -> YYYY-MM-DD)"""
        if not date_str or date_str == '-' or len(date_str) != 8:
            return '-'
        
        try:
            return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        except:
            return date_str

class RenewalFeeCalculator:
    """연차료 계산기"""
    
    # 2024년 기준 연차료 (원)
    RENEWAL_FEES = {
        1: 42000, 2: 42000, 3: 42000,
        4: 95000, 5: 95000, 6: 95000,
        7: 250000, 8: 250000, 9: 250000,
        10: 500000, 11: 500000, 12: 500000,
        13: 660000, 14: 660000, 15: 660000,
        16: 850000, 17: 850000, 18: 850000,
        19: 1100000, 20: 1100000
    }
    
    def __init__(self):
        self.today = datetime.now().date()
        
    def calculate_renewal_info(self, patent: PatentInfo) -> RenewalFeeInfo:
        """연차료 정보 계산"""
        if patent.registration_date == '-':
            return self._create_empty_renewal_info()
            
        try:
            reg_date = datetime.strptime(patent.registration_date, '%Y-%m-%d').date()
            current_year = self._calculate_current_renewal_year(reg_date)
            
            if current_year > 20:
                return self._create_expired_renewal_info()
                
            due_date = self._calculate_due_date(reg_date, current_year)
            fee_amount = self.RENEWAL_FEES.get(current_year, 0)
            status = self._determine_status(due_date)
            
            return RenewalFeeInfo(
                due_date=due_date.strftime('%Y-%m-%d'),
                year_number=f"{current_year}년차",
                fee_amount=f"{fee_amount:,}원",
                status=status,
                next_year_request=self._calculate_next_year_request(current_year, due_date),
                late_payment_period=self._calculate_late_payment_period(due_date, status),
                recovery_period=self._calculate_recovery_period(due_date, status)
            )
            
        except ValueError as e:
            print(f"❌ 날짜 처리 오류: {e}")
            return self._create_empty_renewal_info()

    def _calculate_current_renewal_year(self, registration_date) -> int:
        """현재 연차수 계산"""
        years_passed = (self.today - registration_date).days // 365
        return min(years_passed + 1, 20)

    def _calculate_due_date(self, registration_date, year_number: int):
        """납부 마감일 계산 (등록일 + (연차수-1)년)"""
        return registration_date.replace(year=registration_date.year + (year_number - 1))

    def _determine_status(self, due_date) -> str:
        """유효/불납 상태 판정"""
        days_diff = (due_date - self.today).days
        
        if days_diff > 0:
            return "유효"
        elif days_diff >= -180:  # 추납기간 (6개월)
            return "추납기간"
        elif days_diff >= -540:  # 회복기간 (추가 12개월)
            return "회복기간"
        else:
            return "만료"

    def _calculate_next_year_request(self, current_year: int, due_date) -> str:
        """차기년도 납부의뢰 정보"""
        if current_year >= 20:
            return "만료"
            
        next_year = current_year + 1
        next_fee = self.RENEWAL_FEES.get(next_year, 0)
        next_due_date = due_date.replace(year=due_date.year + 1)
        
        return f"{next_year}년차 {next_fee:,}원 ({next_due_date.strftime('%Y-%m-%d')} 마감)"

    def _calculate_late_payment_period(self, due_date, status: str) -> str:
        """추납기간 계산"""
        if status != "추납기간":
            return "-"
            
        start_date = due_date + timedelta(days=1)
        end_date = due_date + timedelta(days=180)
        
        if self.today <= end_date:
            return f"진행중 ({end_date.strftime('%Y-%m-%d')} 마감)"
        else:
            return f"{start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')}"

    def _calculate_recovery_period(self, due_date, status: str) -> str:
        """회복기간 계산"""
        if status != "회복기간":
            return "-"
            
        start_date = due_date + timedelta(days=181)
        end_date = due_date + timedelta(days=540)
        
        if self.today <= end_date:
            return f"진행중 ({end_date.strftime('%Y-%m-%d')} 마감)"
        else:
            return f"{start_date.strftime('%Y-%m-%d')} ~ {end_date.strftime('%Y-%m-%d')}"

    def _create_empty_renewal_info(self) -> RenewalFeeInfo:
        """빈 연차료 정보 생성"""
        return RenewalFeeInfo("-", "-", "-", "-", "-", "-", "-")

    def _create_expired_renewal_info(self) -> RenewalFeeInfo:
        """만료된 특허 연차료 정보"""
        return RenewalFeeInfo("-", "만료", "-", "만료", "만료", "-", "-")

class CSVGenerator:
    """CSV 파일 생성기"""
    
    def __init__(self):
        pass
        
    def create_renewal_report(self, customer_number: str, patents_data: List[tuple], applicant_name: str = "") -> str:
        """연차료 보고서 CSV 파일 생성"""
        try:
            # 파일명 생성
            current_time = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"특허연차료현황_{customer_number}_{current_time}.csv"
            
            # CSV 파일 생성
            with open(filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
                writer = csv.writer(csvfile)
                
                # 제목 및 고객 정보
                writer.writerow(['특허 연차료 현황 보고서'])
                writer.writerow([])  # 빈 줄
                writer.writerow(['고객번호', customer_number])
                writer.writerow(['출원인', applicant_name])
                writer.writerow(['조회일시', datetime.now().strftime('%Y-%m-%d %H:%M:%S')])
                writer.writerow([])  # 빈 줄
                
                # 헤더 설정
                headers = [
                    "번호", "출원번호", "등록번호", "출원인", "등록날짜", "발명명칭",
                    "해당연차수", "해당연차료", "납부마감일", "유효/불납",
                    "차기년도납부의뢰", "추납기간", "회복기간"
                ]
                writer.writerow(headers)
                
                # 데이터 입력
                for patent_data in patents_data:
                    writer.writerow(patent_data)
            
            return filename
            
        except Exception as e:
            print(f"❌ CSV 파일 생성 오류: {e}")
            return None

class PatentRenewalSystem:
    """특허 연차료 조회 시스템"""
    
    def __init__(self):
        self.kipris_client = KiprisAPIClient()
        self.renewal_calculator = RenewalFeeCalculator()
        self.csv_generator = CSVGenerator()
        self.last_query_result = None  # 마지막 조회 결과 저장
        
    def process_customer_renewal(self, customer_number: str):
        """고객번호로 연차료 정보 조회 및 출력"""
        
        print("\n" + "="*80)
        print("📋 특허 연차료 조회 시스템")
        print("="*80)
        print(f"고객번호: {customer_number}")
        print(f"조회일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*80)
        
        # 등록특허 검색
        patents = self.kipris_client.search_registered_patents(customer_number)
        
        if not patents:
            print("❌ 등록특허를 찾을 수 없습니다.")
            return
            
        print(f"\n📊 총 {len(patents)}건의 등록특허가 발견되었습니다.\n")
        
        # 각 특허별 연차료 계산 및 출력
        patents_with_renewal = []
        for i, patent in enumerate(patents, 1):
            renewal_info = self.renewal_calculator.calculate_renewal_info(patent)
            self._display_patent_info(i, patent, renewal_info)
            patents_with_renewal.append((patent, renewal_info))
            
        # 결과 저장 (엑셀 다운로드용)
        self.last_query_result = {
            'customer_number': customer_number,
            'applicant_name': patents[0].applicant_name if patents else '정보 없음',
            'patents_with_renewal': patents_with_renewal
        }
        
        print("\n" + "="*80)
        print("✅ 연차료 조회가 완료되었습니다.")
        print("💾 CSV 다운로드를 원하시면 메뉴에서 '3번'을 선택하세요.")
        print("="*80)

    def _display_patent_info(self, index: int, patent: PatentInfo, renewal: RenewalFeeInfo):
        """특허 정보 및 연차료 정보 출력"""
        print(f"【{index}】 특허 정보")
        print("-" * 60)
        print(f"📄 출원번호: {patent.application_number}")
        print(f"📄 등록번호: {patent.registration_number}")
        print(f"👥 출원인: {patent.applicant_name}")
        print(f"📅 등록날짜: {patent.registration_date}")
        
        # 발명명칭 20자까지만 출력
        title = patent.invention_title
        if len(title) > 20:
            title = title[:20] + "..."
        print(f"💡 발명명칭: {title}")
        
        print(f"\n💰 연차료 관련 정보:")
        print(f"  - 해당 연차료 납부마감일: {renewal.due_date}")
        print(f"  - 해당연차수: {renewal.year_number}")
        print(f"  - 해당연차료: {renewal.fee_amount}")
        print(f"  - 유효/불납: {renewal.status}")
        print(f"  - 차기년도 납부의뢰: {renewal.next_year_request}")
        print(f"  - 추납기간: {renewal.late_payment_period}")
        print(f"  - 회복기간: {renewal.recovery_period}")
        print()

    def batch_process_customers(self, customer_numbers: List[str]):
        """여러 고객번호 배치 처리"""
        print(f"\n🔄 배치 처리 시작: {len(customer_numbers)}개 고객")
        print("="*80)
        
        for i, customer_number in enumerate(customer_numbers, 1):
            print(f"\n[{i}/{len(customer_numbers)}] 고객번호: {customer_number}")
            try:
                self.process_customer_renewal(customer_number)
            except Exception as e:
                print(f"❌ 처리 중 오류 발생: {e}")
                continue
            
            # API 호출 제한을 위한 대기 (1초)
            if i < len(customer_numbers):
                print("⏳ API 호출 제한을 위해 1초 대기...")
                import time
                time.sleep(1)
        
        print(f"\n✅ 배치 처리 완료: {len(customer_numbers)}개 고객 처리됨")

    def export_to_csv(self):
        """마지막 조회 결과를 CSV로 내보내기"""
        if not self.last_query_result:
            print("❌ 내보낼 데이터가 없습니다. 먼저 특허를 조회해주세요.")
            return
            
        try:
            print("📊 CSV 파일을 생성하고 있습니다...")
            
            # CSV 데이터 준비
            patents_data = []
            for i, (patent, renewal) in enumerate(self.last_query_result['patents_with_renewal'], 1):
                # 발명명칭 20자 제한
                title = patent.invention_title
                if len(title) > 20:
                    title = title[:20] + "..."
                    
                patents_data.append((
                    i,  # 번호
                    patent.application_number,  # 출원번호
                    patent.registration_number,  # 등록번호
                    patent.applicant_name,  # 출원인
                    patent.registration_date,  # 등록날짜
                    title,  # 발명명칭
                    renewal.year_number,  # 해당연차수
                    renewal.fee_amount,  # 해당연차료
                    renewal.due_date,  # 납부마감일
                    renewal.status,  # 유효/불납
                    renewal.next_year_request,  # 차기년도납부의뢰
                    renewal.late_payment_period,  # 추납기간
                    renewal.recovery_period  # 회복기간
                ))
            
            # CSV 파일 생성
            filename = self.csv_generator.create_renewal_report(
                self.last_query_result['customer_number'],
                patents_data,
                self.last_query_result['applicant_name']
            )
            
            if filename:
                print(f"✅ CSV 파일이 생성되었습니다: {filename}")
                print(f"📁 저장 위치: {os.path.abspath(filename)}")
                print("💡 CSV 파일은 Excel에서 열 수 있습니다.")
            else:
                print("❌ CSV 파일 생성에 실패했습니다.")
                
        except Exception as e:
            print(f"❌ CSV 내보내기 오류: {e}")

def main():
    """메인 실행 함수"""
    system = PatentRenewalSystem()
    
    while True:
        print("\n" + "="*50)
        print("🏛️  특허 연차료 조회 시스템")
        print("="*50)
        print("1. 단일 고객번호 조회")
        print("2. 배치 처리 (여러 고객번호)")
        print("3. CSV 다운로드 (마지막 조회 결과)")
        print("4. 종료")
        print("-"*50)
        
        choice = input("선택 (1-4): ").strip()
        
        if choice == '1':
            customer_number = input("\n고객번호를 입력하세요 (12자리): ").strip()
            
            if len(customer_number) != 12 or not customer_number.isdigit():
                print("❌ 고객번호는 12자리 숫자여야 합니다.")
                continue
                
            system.process_customer_renewal(customer_number)
            
        elif choice == '2':
            print("\n고객번호들을 입력하세요 (쉼표로 구분):")
            input_text = input().strip()
            
            if not input_text:
                print("❌ 고객번호를 입력해주세요.")
                continue
                
            customer_numbers = [num.strip() for num in input_text.split(',')]
            
            # 고객번호 유효성 검사
            valid_numbers = []
            for num in customer_numbers:
                if len(num) == 12 and num.isdigit():
                    valid_numbers.append(num)
                else:
                    print(f"❌ 잘못된 고객번호 형식: {num} (건너뛰기)")
            
            if not valid_numbers:
                print("❌ 유효한 고객번호가 없습니다.")
                continue
                
            system.batch_process_customers(valid_numbers)
            
        elif choice == '3':
            system.export_to_csv()
            
        elif choice == '4':
            print("\n👋 프로그램을 종료합니다.")
            break
            
        else:
            print("❌ 잘못된 선택입니다. 1-4 중에서 선택해주세요.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ 사용자에 의해 프로그램이 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 예상치 못한 오류 발생: {e}")
        sys.exit(1)