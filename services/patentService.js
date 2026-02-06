// services/patentService.js - 특허 서비스 로직
const axios = require('axios');
const xml2js = require('xml2js');
const XLSX = require('xlsx');
const https = require('https');

class PatentService {
    constructor() {
        // 환경변수는 이미 상위에서 로드되어 있어야 함
        this.apiKey = process.env.KIPRIS_API_KEY;
        this.baseUrl = process.env.KIPRIS_API_BASE_URL || 'https://plus.kipris.or.kr/kipo-api/kipi';
        this.parser = new xml2js.Parser({ explicitArray: false });

        // HTTPS Agent 설정 (정부 API SSL 인증서 처리용)
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
            // 개발환경에서는 self-signed certificate 허용, 운영환경에서는 엄격하게 검증
            keepAlive: true,
            timeout: 10000
        });

        // 환경변수 검증
        if (!this.apiKey) {
            console.error('⚠️ KIPRIS_API_KEY가 설정되지 않았습니다.');
            throw new Error('KIPRIS_API_KEY is required');
        }
        if (!this.baseUrl) {
            console.error('⚠️ KIPRIS_API_BASE_URL이 설정되지 않았습니다.');
        }

        console.log('🔧 PatentService 초기화:', {
            baseUrl: this.baseUrl,
            apiKeySet: !!this.apiKey,
            nodeEnv: process.env.NODE_ENV,
            sslVerification: process.env.NODE_ENV === 'production'
        });
    }

    // 등록특허 검색 - 특허청 등록원부 API 사용
    async searchRegisteredPatents(searchValue, searchType = '2') {
        try {
            console.log('🌐 등록특허 검색 요청:', { searchValue, searchType });

            // searchType에 따라 다른 로직 사용
            if (searchType === '1') {
                // 사업자번호로 검색
                return await this.searchByBusinessNumber(searchValue);
            } else {
                // 고객번호로 검색 (기존 로직 유지)
                return await this.searchByCustomerNumber(searchValue);
            }

        } catch (error) {
            console.error('등록특허 검색 오류:', error.message);
            throw error;
        }
    }

    // 사업자번호로 등록특허 검색
    async searchByBusinessNumber(businessNumber) {
        try {
            const url = process.env.PATENT_OFFICE_API_URL || 'https://apis.data.go.kr/1430000/PttRgstRtInfoInqSvc/getBusinessRightList';
            const serviceKey = process.env.PATENT_OFFICE_API_KEY;

            if (!serviceKey) {
                console.error('⚠️ PATENT_OFFICE_API_KEY가 설정되지 않았습니다.');
                throw new Error('PATENT_OFFICE_API_KEY is required');
            }

            console.log('🌐 사업자번호로 특허청 등록원부 API 호출:', { businessNumber });

            const response = await axios.get(url, {
                params: {
                    serviceKey: serviceKey,
                    type: 'json',
                    pageNo: 1,
                    numOfRows: 100,
                    searchType: 1, // 사업자번호
                    searchVal: businessNumber
                },
                httpsAgent: this.httpsAgent,
                timeout: 10000
            });

            console.log('📡 특허청 API 응답 상태:', response.status);

            const data = response.data;
            console.log('📊 원본 API 응답:', JSON.stringify(data, null, 2));

            // API 응답 구조 확인 및 데이터 추출
            if (!data || data.resultCode !== '000') {
                console.log('⚠️ API 응답 오류:', {
                    resultCode: data?.resultCode,
                    resultMsg: data?.resultMsg
                });
                return {
                    customerNumber: businessNumber,
                    applicantName: '정보 없음',
                    totalCount: 0,
                    patents: []
                };
            }

            // rightList가 없거나 빈 경우 처리
            if (!data.items || !data.items.rightList) {
                console.log('⚠️ rightList가 없음');
                return {
                    customerNumber: businessNumber,
                    applicantName: '정보 없음',
                    totalCount: 0,
                    patents: []
                };
            }

            let rightList = Array.isArray(data.items.rightList) ? data.items.rightList : [data.items.rightList];
            const totalCount = data.totalCount || rightList.length;

            console.log('🔍 조회된 등록특허 수:', totalCount);

            // 특허 데이터 변환
            const patents = rightList.map(item => {
                const getFirstApplicant = (applicantStr) => {
                    if (!applicantStr || applicantStr === '-') return '-';
                    return applicantStr.split(',')[0].trim();
                };

                return {
                    applicationNumber: item.applNo || '-',
                    registrationNumber: item.rgstNo || '-',
                    applicantName: getFirstApplicant(item.applicantInfo) || getFirstApplicant(item.rightHolderInfo) || '-',
                    applicationDate: this.formatDateFromAPI(item.applDate),
                    inventionTitle: item.title || '-',
                    registrationDate: this.formatDateFromAPI(item.rgstDate),
                    claimCount: item.claimCount || '-',
                    publicationNumber: item.pubNo || '-',
                    publicationDate: this.formatDateFromAPI(item.pubDate),
                    expirationDate: this.formatDateFromAPI(item.cndrtExptnDate),
                    registrationStatus: item.rgstStatus || '등록',
                    rightHolderInfo: item.rightHolderInfo || '-',
                    agentInfo: item.agentInfo || '-',
                    businessNo: item.businessNo || '-',
                    applicantCd: item.applicantCd || '-', // 고객번호 추가
                    examStatus: '등록',
                    ipcCode: '-',
                    abstract: '-'
                };
            });

            const applicantName = patents[0]?.applicantName || '정보 없음';
            const getFirstRightHolder = (rightHolderStr) => {
                if (!rightHolderStr || rightHolderStr === '-') return '정보 없음';
                return rightHolderStr.split(',')[0].trim();
            };
            const rightHolderName = getFirstRightHolder(patents[0]?.rightHolderInfo) || '정보 없음';

            return {
                customerNumber: businessNumber,
                applicantName,
                rightHolderName,
                totalCount,
                patents
            };

        } catch (error) {
            console.error('사업자번호 검색 오류:', error.message);
            if (error.response) {
                console.error('API 응답 오류:', error.response.data);
            }
            throw error;
        }
    }

    // 고객번호로 등록특허 검색 (기존 로직 유지)
    async searchByCustomerNumber(customerNumber) {
        try {
            const url = process.env.PATENT_OFFICE_API_URL || 'https://apis.data.go.kr/1430000/PttRgstRtInfoInqSvc/getBusinessRightList';
            const serviceKey = process.env.PATENT_OFFICE_API_KEY;

            if (!serviceKey) {
                console.error('⚠️ PATENT_OFFICE_API_KEY가 설정되지 않았습니다.');
                throw new Error('PATENT_OFFICE_API_KEY is required');
            }

            console.log('🌐 고객번호로 특허청 등록원부 API 호출:', { customerNumber });

            const response = await axios.get(url, {
                params: {
                    serviceKey: serviceKey,
                    type: 'json',
                    pageNo: 1,
                    numOfRows: 100,
                    searchType: 2, // 특허고객번호
                    searchVal: customerNumber
                },
                httpsAgent: this.httpsAgent,
                timeout: 10000
            });

            console.log('📡 특허청 API 응답 상태:', response.status);

            const data = response.data;
            console.log('📊 원본 API 응답 구조:', JSON.stringify(data, null, 2));

            // API 응답 구조 확인 및 데이터 추출
            if (!data || data.resultCode !== '000' || !data.items) {
                console.log('⚠️ API 응답 오류 또는 검색 결과 없음:', {
                    resultCode: data?.resultCode,
                    resultMsg: data?.resultMsg,
                    hasItems: !!data?.items
                });
                return {
                    customerNumber: customerNumber,
                    applicantName: '정보 없음',
                    totalCount: 0,
                    patents: []
                };
            }

            // rightList가 없거나 빈 경우 처리
            if (!data.items.rightList) {
                console.log('⚠️ rightList가 없음');
                return {
                    customerNumber: customerNumber,
                    applicantName: '정보 없음',
                    totalCount: 0,
                    patents: []
                };
            }

            let rightList = Array.isArray(data.items.rightList) ? data.items.rightList : [data.items.rightList];
            const totalCount = data.totalCount || rightList.length;

            console.log('🔍 조회된 등록특허 수 (필터링 후):', totalCount);

            // 특허 데이터 변환
            const patents = rightList.map(item => {
                // 출원인명에서 첫 번째 이름만 추출 (콤마로 구분된 경우)
                const getFirstApplicant = (applicantStr) => {
                    if (!applicantStr || applicantStr === '-') return '-';
                    return applicantStr.split(',')[0].trim();
                };

                return {
                    // 기본 정보
                    applicationNumber: item.applNo || '-',
                    registrationNumber: item.rgstNo || '-',
                    applicantName: getFirstApplicant(item.applicantInfo) || getFirstApplicant(item.rightHolderInfo) || '-',
                    applicationDate: this.formatDateFromAPI(item.applDate),
                    inventionTitle: item.title || '-',

                    // 등록 정보 (발명자 필드 제거)
                    registrationDate: this.formatDateFromAPI(item.rgstDate),
                    claimCount: item.claimCount || '-',

                    // 추가 정보
                    publicationNumber: item.pubNo || '-',
                    publicationDate: this.formatDateFromAPI(item.pubDate),
                    expirationDate: this.formatDateFromAPI(item.cndrtExptnDate),
                    registrationStatus: item.rgstStatus || '등록',

                    // 권리자 정보
                    rightHolderInfo: item.rightHolderInfo || '-',
                    agentInfo: item.agentInfo || '-',
                    businessNo: item.businessNo || '-',
                    applicantCd: item.applicantCd || '-', // 고객번호 추가

                    // UI에 필요한 추가 필드들 (연차료 계산용)
                    examStatus: '등록',
                    ipcCode: '-',
                    abstract: '-'
                };
            });

            const applicantName = patents[0]?.applicantName || '정보 없음';

            // 권리자명 추출 (첫 번째 특허의 rightHolderInfo에서 첫 번째 이름만)
            const getFirstRightHolder = (rightHolderStr) => {
                if (!rightHolderStr || rightHolderStr === '-') return '정보 없음';
                return rightHolderStr.split(',')[0].trim();
            };
            const rightHolderName = getFirstRightHolder(patents[0]?.rightHolderInfo) || '정보 없음';

            return {
                customerNumber: customerNumber,
                applicantName,
                rightHolderName,
                totalCount,
                patents
            };

        } catch (error) {
            console.error('등록특허 API 호출 오류:', error.message);
            if (error.response) {
                console.error('API 응답 오류:', error.response.data);
            }
            throw error;
        }
    }

    // 직전년도 납부정보 조회 - 특허청 등록원부 이력 API 사용
    async getPatentRegisterHistory(registrationNumber) {
        try {
            const url = 'https://apis.data.go.kr/1430000/PttRgstRtInfoInqSvc/getPatentRegisterHistory';
            const serviceKey = process.env.PATENT_OFFICE_API_KEY;

            if (!serviceKey) {
                console.error('⚠️ PATENT_OFFICE_API_KEY가 설정되지 않았습니다.');
                throw new Error('PATENT_OFFICE_API_KEY is required');
            }

            console.log('🌐 특허청 등록원부 이력 API 호출:', { url, registrationNumber });

            const response = await axios.get(url, {
                params: {
                    serviceKey: serviceKey,
                    type: 'json', // JSON 형식으로 요청 (요구사항에 따라)
                    rgstNo: registrationNumber
                },
                httpsAgent: this.httpsAgent,
                timeout: 10000
            });

            console.log('📡 특허청 이력 API 응답 상태:', response.status);

            // JSON 응답 처리
            const data = response.data;
            console.log('📊 JSON 응답 결과:', JSON.stringify(data, null, 2));

            // API 응답 구조 상세 분석
            console.log('🔍 API 응답 구조 분석:', {
                hasData: !!data,
                resultCode: data?.resultCode,
                resultMsg: data?.resultMsg,
                hasItems: !!data?.items,
                hasPay: !!data?.items?.pay,
                payType: Array.isArray(data?.items?.pay) ? 'array' : typeof data?.items?.pay,
                payLength: Array.isArray(data?.items?.pay) ? data.items.pay.length : 'not array'
            });

            // <pay> 데이터에서 마지막 항목의 연차 정보 추출
            if (data && data.items && Array.isArray(data.items.pay) && data.items.pay.length > 0) {
                const lastPayItem = data.items.pay[data.items.pay.length - 1]; // <pay>의 마지막 항목

                return {
                    lastAnnl: lastPayItem.lastAnnl || '-',
                    payDate: lastPayItem.payDate || '-',
                    payAmount: lastPayItem.payAmount || '-'
                };
            } else if (data && data.items && data.items.pay) {
                // <pay>가 단일 객체인 경우
                const payItem = data.items.pay;
                return {
                    lastAnnl: payItem.lastAnnl || '-',
                    payDate: payItem.payDate || '-',
                    payAmount: payItem.payAmount || '-'
                };
            }

            // 데이터가 없는 경우
            return {
                lastAnnl: '-',
                payDate: '-',
                payAmount: '-'
            };

        } catch (error) {
            console.error('직전년도 납부정보 API 호출 오류:', error.message);
            console.error('오류 상세:', {
                code: error.code,
                response: error.response?.data,
                status: error.response?.status,
                message: error.message
            });
            return {
                lastAnnl: '-',
                payDate: '-',
                payAmount: '-',
                error: error.message
            };
        }
    }

    // 날짜 형식 변환 헬퍼 메서드 (YYYYMMDD -> YYYY.MM.DD)
    formatDateFromAPI(dateStr) {
        if (!dateStr || dateStr === '-' || dateStr.length !== 8) {
            return '-';
        }
        return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
    }

    // 출원특허 검색 (출원번호 기반 서지상세정보 조회)
    async searchApplicationPatents(customerNumber) {
        try {
            console.log('🔍 출원특허 검색 시작:', customerNumber);

            // 1단계: 기본 검색으로 출원번호 목록 가져오기
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getWordSearch`;

            console.log('🌐 KIPRIS API 호출:', { url, customerNumber });

            const response = await axios.get(url, {
                params: {
                    word: customerNumber,
                    ServiceKey: this.apiKey,
                    numOfRows: 500, // 더 많은 결과를 위해 500으로 증가
                    pageNo: 1
                },
                timeout: 15000
            });

            console.log('📡 API 응답 상태:', response.status);
            console.log('📊 API 응답 데이터 (처음 1000자):', JSON.stringify(response.data).substring(0, 1000));

            // 응답 데이터 파싱
            const allPatents = await this.parseResponse(response.data);

            console.log(`📊 파싱된 특허 수: ${allPatents.length}건`);
            
            // 출원번호가 있는 모든 특허 필터링
            const basicPatents = allPatents.filter(p => 
                p.applicationNumber && 
                p.applicationNumber !== '-' && 
                p.applicationNumber.trim() !== ''
            );

            if (basicPatents.length === 0) {
                return {
                    customerNumber,
                    applicantName: '정보 없음',
                    totalCount: 0,
                    patents: []
                };
            }

            // 2단계: 각 출원번호별로 서지상세정보, 공개전문, 공고전문 URL 조회
            const detailedPatents = await Promise.all(
                basicPatents.map(async (basicPatent) => {
                    try {
                        // 서지상세정보 조회
                        const detailInfo = await this.getBibliographyDetailInfo(basicPatent.applicationNumber);
                        
                        // 공개전문과 공고전문 URL을 병렬로 조회
                        const [pubFullText, annFullText] = await Promise.all([
                            this.getPublicationFullTextUrl(basicPatent.applicationNumber),
                            this.getAnnouncementFullTextUrl(basicPatent.applicationNumber)
                        ]);
                        
                        console.log(`🔍 출원번호 ${basicPatent.applicationNumber}:`, {
                            publicationFullText: pubFullText?.path || '없음',
                            announcementFullText: annFullText?.path || '없음'
                        });
                        
                        // 기본 정보와 상세 정보 병합
                        return {
                            // 기본 정보
                            applicationNumber: basicPatent.applicationNumber,
                            registrationNumber: detailInfo?.registrationNumber || basicPatent.registrationNumber || '-',
                            applicantName: detailInfo?.applicantName || basicPatent.applicantName,
                            inventorName: detailInfo?.inventorName || basicPatent.inventorName,
                            applicationDate: this.formatDate(detailInfo?.applicationDate || basicPatent.applicationDate),
                            inventionTitle: detailInfo?.inventionTitle || basicPatent.inventionTitle,
                            
                            // 서지상세정보에서 가져온 추가 정보
                            priorityApplicationDate: detailInfo?.priorityApplicationDate || '-',
                            pctDeadline: this.calculatePctDeadline(
                                detailInfo?.priorityApplicationDate,
                                detailInfo?.applicationDate || basicPatent.applicationDate
                            ),
                            currentStatus: detailInfo?.currentStatus || basicPatent.registrationStatus || '심사중',

                            // 공개전문/공고전문 URL
                            publicationFullText: pubFullText?.path || '-',
                            publicationDocName: pubFullText?.docName || '-',
                            announcementFullText: annFullText?.path || '-',
                            announcementDocName: annFullText?.docName || '-',

                            // PCT 출원번호
                            pctApplicationNumber: detailInfo?.pctApplicationNumber || '-'
                        };
                    } catch (error) {
                        console.error(`출원번호 ${basicPatent.applicationNumber} 상세 정보 조회 실패:`, error.message);
                        // 오류가 있어도 기본 정보는 반환
                        return {
                            ...basicPatent,
                            priorityApplicationDate: '-',
                            pctDeadline: this.calculatePctDeadline('-', basicPatent.applicationDate),
                            currentStatus: basicPatent.registrationStatus || '심사중',
                            publicationFullText: '-',
                            publicationDocName: '-',
                            announcementFullText: '-',
                            announcementDocName: '-',
                            pctApplicationNumber: '-'
                        };
                    }
                })
            );

            return {
                customerNumber,
                applicantName: detailedPatents[0]?.applicantName || '정보 없음',
                totalCount: detailedPatents.length,
                patents: detailedPatents
            };

        } catch (error) {
            console.error('출원특허 API 호출 오류:', error.message);
            throw error;
        }
    }


    // API 응답 파싱
    async parseResponse(data) {
        try {
            // XML 응답인 경우
            if (typeof data === 'string' && data.includes('<?xml')) {
                return await this.parseXMLResponse(data);
            }
            
            // JSON 응답인 경우
            if (typeof data === 'object') {
                return this.parseJSONResponse(data);
            }
            
            return [];
        } catch (error) {
            console.error('응답 파싱 오류:', error);
            return [];
        }
    }

    // XML 응답 파싱
    async parseXMLResponse(xmlData) {
        return new Promise((resolve, reject) => {
            this.parser.parseString(xmlData, (err, result) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    const patents = [];
                    
                    // 일반 특허 검색 응답의 경우
                    if (result?.response?.body?.items?.item) {
                        const items = Array.isArray(result.response.body.items.item) 
                            ? result.response.body.items.item 
                            : [result.response.body.items.item];

                        items.forEach(item => {
                            patents.push(this.formatPatentData(item));
                        });
                    }
                    // 공개전문/공고전문 조회 응답의 경우 (items가 없는 구조)
                    else if (result?.response?.body?.item) {
                        const items = Array.isArray(result.response.body.item) 
                            ? result.response.body.item 
                            : [result.response.body.item];

                        items.forEach(item => {
                            // 공개전문/공고전문의 경우 간단한 구조로 반환
                            patents.push({
                                docName: this.getValue(item.docName),
                                path: this.getValue(item.path)
                            });
                        });
                    }

                    resolve(patents);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // JSON 응답 파싱
    parseJSONResponse(data) {
        const patents = [];
        
        if (data?.response?.body?.items?.item) {
            const items = Array.isArray(data.response.body.items.item) 
                ? data.response.body.items.item 
                : [data.response.body.items.item];

            items.forEach(item => {
                patents.push(this.formatPatentData(item));
            });
        }

        return patents;
    }

    // 특허 데이터 포맷팅
    formatPatentData(item) {
        return {
            applicationNumber: this.getValue(item.applicationNumber),
            registrationNumber: this.getValue(item.registerNumber), // registerNumber로 수정
            applicantName: this.getValue(item.applicantName),
            inventorName: this.getValue(item.inventorName),
            applicationDate: this.formatDate(this.getValue(item.applicationDate)),
            registrationDate: this.formatDate(this.getValue(item.registerDate)), // registerDate로 수정
            publicationDate: this.formatDate(this.getValue(item.publicationDate)),
            expirationDate: this.formatDate(this.getValue(item.rightDuration)),
            inventionTitle: this.getValue(item.inventionTitle),
            claimCount: this.getValue(item.claimCount),
            registrationStatus: this.getValue(item.registerStatus) || '심사중',
            examStatus: this.getValue(item.examStatus),
            ipcCode: this.getValue(item.ipcCode),
            abstract: this.getValue(item.abstract),
            // 새로운 필드들 추가
            priorityApplicationDate: this.getValue(item.priorityApplicationDate),
            pctDeadline: this.formatDate(this.getValue(item.pctDeadline)),
            publicationFullText: this.getValue(item.publicationFullText),
            announcementFullText: this.getValue(item.announcementFullText),
            pctApplicationNumber: this.getValue(item.pctApplicationNumber)
        };
    }

    // 값 추출 헬퍼
    getValue(value) {
        if (value === undefined || value === null) return '-';
        if (typeof value === 'object' && value._) return value._;
        return String(value);
    }

    // 날짜 포맷팅
    formatDate(dateStr) {
        if (!dateStr || dateStr === '-') return '-';
        
        // YYYY.MM.DD -> YYYY-MM-DD (KIPRIS API 형식)
        if (dateStr.includes('.')) {
            return dateStr.replace(/\./g, '-');
        }
        
        // YYYYMMDD -> YYYY-MM-DD
        if (dateStr.length === 8) {
            return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }
        
        return dateStr;
    }

    // PCT 마감일 계산 (연도만 +1, 월일은 그대로 유지)
    calculatePctDeadline(priorityDate, applicationDate) {
        try {
            // 기준일 결정 (우선일이 있으면 우선일, 없으면 출원일)
            let baseDate;
            if (priorityDate && priorityDate !== '-') {
                baseDate = priorityDate;
            } else if (applicationDate && applicationDate !== '-') {
                baseDate = applicationDate;
            } else {
                return '-';
            }

            let year, month, day;

            // 날짜 문자열에서 연도, 월, 일 추출
            if (baseDate.includes('-')) {
                // YYYY-MM-DD 형태
                const parts = baseDate.split('-');
                year = parseInt(parts[0]);
                month = parts[1];
                day = parts[2];
            } else if (baseDate.includes('.')) {
                // YYYY.MM.DD 형태
                const parts = baseDate.split('.');
                year = parseInt(parts[0]);
                month = parts[1];
                day = parts[2];
            } else if (baseDate.length === 8) {
                // YYYYMMDD 형태
                year = parseInt(baseDate.substring(0, 4));
                month = baseDate.substring(4, 6);
                day = baseDate.substring(6, 8);
            } else {
                return '-';
            }

            // 연도가 유효한지 확인
            if (isNaN(year) || year < 1900 || year > 2100) {
                return '-';
            }

            // 연도만 +1, 월일은 그대로
            const newYear = year + 1;

            // YYYY-MM-DD 형태로 포맷팅
            return `${newYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } catch (error) {
            console.error('PCT 마감일 계산 오류:', error);
            return '-';
        }
    }

    // 출원번호 포맷팅
    formatApplicationNumber(applicationNumber) {
        if (!applicationNumber || applicationNumber === '-') return '-';
        
        // 하이픈 제거해서 숫자만 반환 (기존 시스템과 호환성을 위해)
        return applicationNumber.replace(/-/g, '');
    }

    // IPC 코드 추출
    extractIpcCodes(ipcInfoArray) {
        if (!ipcInfoArray || !ipcInfoArray.ipcInfo) return '-';
        
        const ipcInfos = Array.isArray(ipcInfoArray.ipcInfo) 
            ? ipcInfoArray.ipcInfo 
            : [ipcInfoArray.ipcInfo];
        
        const ipcCodes = ipcInfos.map(info => info.ipcNumber).filter(code => code);
        return ipcCodes.length > 0 ? ipcCodes.join(', ') : '-';
    }

    // 권리 존속기간 만료일 계산 (출원일 + 20년)
    calculateExpirationDate(applicationDate) {
        if (!applicationDate || applicationDate === '-') return '-';
        
        try {
            // YYYY.MM.DD 형식을 Date 객체로 변환
            const dateStr = applicationDate.replace(/\./g, '-');
            const appDate = new Date(dateStr);
            
            if (isNaN(appDate.getTime())) return '-';
            
            // 20년 추가
            const expirationDate = new Date(appDate);
            expirationDate.setFullYear(appDate.getFullYear() + 20);
            
            // YYYY-MM-DD 형식으로 반환
            return expirationDate.toISOString().split('T')[0];
        } catch (error) {
            console.error('권리존속기간 계산 오류:', error);
            return '-';
        }
    }


    // 서지상세정보 조회 (출원번호 기반)
    async getBibliographyDetailInfo(applicationNumber) {
        try {
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getBibliographyDetailInfoSearch`;
            
            const response = await axios.get(url, {
                params: {
                    applicationNumber: applicationNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            console.log(`📋 상세 API 응답 크기 (${applicationNumber}):`, JSON.stringify(response.data).length, 'bytes');

            // XML 응답 처리
            if (typeof response.data === 'string' && response.data.includes('<?xml')) {
                return new Promise((resolve, reject) => {
                    this.parser.parseString(response.data, (err, result) => {
                        if (err) {
                            console.error('XML 파싱 오류:', err);
                            reject(err);
                            return;
                        }

                        try {
                            if (result?.response?.body?.item) {
                                const item = result.response.body.item;

                                // API 응답 구조 로깅 (디버깅용)
                                console.log(`🔍 서지정보 API 응답 구조 (${applicationNumber}):`, {
                                    hasPublicationInfo: !!item.publicationInfoArray,
                                    hasAnnouncementInfo: !!item.announcementInfoArray,
                                    hasFullTextInfo: !!item.fullTextInfoArray,
                                    hasDocumentInfo: !!item.documentInfoArray,
                                    allKeys: Object.keys(item)
                                });

                                // 기본 정보 추출
                                const biblioInfo = item.biblioSummaryInfoArray?.biblioSummaryInfo || {};
                                const inventorInfo = item.inventorInfoArray?.inventorInfo || {};
                                const applicantInfo = item.applicantInfoArray?.applicantInfo || {};
                                const priorityInfoArray = item.priorityInfoArray?.priorityInfo || [];

                                // 우선일 정보 추출 (첫 번째 우선일 사용)
                                const priorityApplicationDate = Array.isArray(priorityInfoArray) && priorityInfoArray.length > 0
                                    ? this.getValue(priorityInfoArray[0].priorityApplicationDate)
                                    : this.getValue(priorityInfoArray?.priorityApplicationDate);

                                // PCT 출원번호 정보 추출
                                const internationalApplicationNumber = this.getValue(biblioInfo.internationalApplicationNumber);

                                console.log(`🎯 상세 정보 추출 성공 (${applicationNumber}):`, {
                                    claimCount: biblioInfo.claimCount,
                                    inventorName: inventorInfo.name,
                                    registerNumber: biblioInfo.registerNumber,
                                    registerDate: biblioInfo.registerDate,
                                    priorityApplicationDate: priorityApplicationDate,
                                    internationalApplicationNumber: internationalApplicationNumber
                                });

                                const detailInfo = {
                                    applicationNumber: this.formatApplicationNumber(biblioInfo.applicationNumber || applicationNumber),
                                    registrationNumber: this.getValue(biblioInfo.registerNumber),
                                    applicantName: this.getValue(applicantInfo.name) || this.getValue(biblioInfo.applicantName),
                                    inventorName: this.getValue(inventorInfo.name),
                                    applicationDate: this.formatDate(this.getValue(biblioInfo.applicationDate)),
                                    registrationDate: this.formatDate(this.getValue(biblioInfo.registerDate)),
                                    inventionTitle: this.getValue(biblioInfo.inventionTitle),
                                    claimCount: this.getValue(biblioInfo.claimCount),

                                    // 우선일 정보 추가
                                    priorityApplicationDate: this.formatDate(priorityApplicationDate) || '-',

                                    // 추가 정보
                                    publicationDate: this.formatDate(this.getValue(biblioInfo.publicationDate)),
                                    openDate: this.formatDate(this.getValue(biblioInfo.openDate)),
                                    registrationStatus: this.getValue(biblioInfo.registerStatus) || '등록',
                                    examinerName: this.getValue(biblioInfo.examinerName),
                                    finalDisposal: this.getValue(biblioInfo.finalDisposal),

                                    // IPC 코드 추출
                                    ipcCode: this.extractIpcCodes(item.ipcInfoArray),

                                    // 권리 존속 기간 계산 (등록일 + 20년)
                                    expirationDate: this.calculateExpirationDate(biblioInfo.applicationDate),

                                    // PCT 출원번호 정보 추가
                                    pctApplicationNumber: internationalApplicationNumber || '-',

                                    // 법적 상태 정보
                                    legalStatusInfo: item.legalStatusInfoArray?.legalStatusInfo || []
                                };

                                resolve(detailInfo);
                            } else {
                                console.warn(`상세 정보 없음 (${applicationNumber})`);
                                resolve(null);
                            }
                        } catch (parseError) {
                            console.error('데이터 추출 오류:', parseError);
                            reject(parseError);
                        }
                    });
                });
            }
            
            // JSON 응답 처리 (기존 로직)
            if (typeof response.data === 'object') {
                const result = await this.parseResponse(response.data);
                if (result && result.length > 0) {
                    const patent = result[0];
                    return {
                        applicationNumber: patent.applicationNumber,
                        registrationNumber: patent.registrationNumber,
                        applicantName: patent.applicantName,
                        inventorName: patent.inventorName,
                        applicationDate: patent.applicationDate,
                        registrationDate: patent.registrationDate,
                        inventionTitle: patent.inventionTitle,
                        claimCount: patent.claimCount,
                        currentStatus: patent.currentStatus || patent.registrationStatus,
                        ipcCode: patent.ipcCode,
                        legalStatusInfo: patent.legalStatusInfo
                    };
                }
            }
            
            return null;

        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 서지상세정보 조회 오류:`, error.message);
            throw error;
        }
    }

    // 공개전문 파일 URL 조회
    async getPublicationFullTextUrl(applicationNumber) {
        try {
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getPubFullTextInfoSearch`;
            
            const response = await axios.get(url, {
                params: {
                    applicationNumber: applicationNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            // XML 응답 처리
            if (typeof response.data === 'string' && response.data.includes('<?xml')) {
                const result = await this.parseXMLResponse(response.data);
                
                if (result && result.length > 0) {
                    const item = result[0];
                    const docName = this.getValue(item.docName);
                    const path = this.getValue(item.path);
                    
                    console.log(`📄 공개전문 조회 성공 - ${applicationNumber}:`, { docName, path });
                    
                    if (path && path !== '-') {
                        return {
                            docName: docName || '-',
                            path: path
                        };
                    }
                }
            }
            
            return null;

        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 공개전문 URL 조회 오류:`, error.message);
            return null;
        }
    }

    // 공고전문 파일 URL 조회 (수정됨)
    async getAnnouncementFullTextUrl(applicationNumber) {
        try {
            // 실제 KIPRIS API를 사용하여 공고전문 path 조회
            const url = `${this.baseUrl}/patUtiModInfoSearchSevice/getAnnFullTextInfoSearch`;

            const response = await axios.get(url, {
                params: {
                    applicationNumber: applicationNumber,
                    ServiceKey: this.apiKey
                },
                timeout: 10000
            });

            // XML 응답 처리
            if (typeof response.data === 'string' && response.data.includes('<?xml')) {
                const result = await this.parseXMLResponse(response.data);

                if (result && result.length > 0) {
                    const item = result[0];
                    const docName = this.getValue(item.docName);
                    const path = this.getValue(item.path);

                    console.log(`📄 공고전문 조회 성공 - ${applicationNumber}:`, { docName, path });

                    if (path && path !== '-') {
                        return {
                            docName: docName || '-',
                            path: path
                        };
                    }
                }
            }

            return null;

        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 공고전문 URL 조회 오류:`, error.message);
            return null;
        }
    }


    // CSV 생성
    generateCSV(patents, type) {
        let headers = [];
        
        if (type === 'registered') {
            headers = [
                '출원번호', '등록번호', '출원인', '발명자', '출원일', 
                '등록일', '존속기간 만료일', '발명의명칭', '청구항수',
                '직전년도 납부연월', '해당 연차료 납부마감일', '해당연차수', '해당연차료',
                '유효/불납', '차기년도 납부의뢰', '추납기간', '회복기간', '특허평가'
            ];
        } else {
            headers = [
                '출원번호', '등록번호', '출원인', '발명자', '출원일',
                '우선일', 'PCT마감일', '발명의 명칭', '현재상태',
                '공개전문', '공고전문', 'PCT출원번호'
            ];
        }

        const rows = patents.map(p => {
            if (type === 'registered') {
                return [
                    p.applicationNumber,
                    p.registrationNumber,
                    p.applicantName,
                    p.inventorName,
                    p.applicationDate,
                    p.registrationDate,
                    p.expirationDate,
                    `"${p.inventionTitle}"`,
                    p.claimCount,
                    '-', // 직전년도 납부연월
                    '-', // 해당 연차료 납부마감일
                    '-', // 해당연차수
                    '-', // 해당연차료
                    '-', // 유효/불납
                    '-', // 차기년도 납부의뢰
                    '-', // 추납기간
                    '-', // 회복기간
                    '-'  // 특허평가
                ];
            } else {
                return [
                    p.applicationNumber,
                    p.registrationNumber || '-',
                    p.applicantName,
                    p.inventorName,
                    p.applicationDate,
                    p.priorityApplicationDate || '-',
                    p.pctDeadline || '-',
                    `"${p.inventionTitle}"`,
                    p.registrationStatus,
                    p.publicationFullText || '-',
                    p.announcementFullText || '-',
                    p.pctApplicationNumber || '-'
                ];
            }
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csvContent;
    }

    // Excel 생성
    generateExcel(patents, type, customerNumber = '') {
        let headers = [];

        if (type === 'registered') {
            headers = [
                '출원번호', '등록번호', '출원인', '출원일',
                '등록일', '존속기간 만료일', '발명의명칭', '청구항수', '등록상태',
                '직전년도 납부연월', '해당 연차료 납부마감일', '해당연차수', '해당연차료',
                '미납여부', '추납기간', '회복기간', '사업자번호', '고객번호'
            ];
        } else {
            headers = [
                '출원번호', '등록번호', '출원인', '발명자', '출원일',
                '우선일', 'PCT마감일', '발명의 명칭', '현재상태',
                '공개전문', '공고전문', '고객번호'
            ];
        }

        const data = patents.map(p => {
            if (type === 'registered') {
                // 화면에 표시되는 값들과 동일하게 설정
                const calculatedData = p.calculatedData || {};

                return [
                    this.formatApplicationNumberForExcel(p.applicationNumber), // 출원번호 (하이픈 포함)
                    p.registrationNumber || '-',
                    p.applicantName || '-',
                    this.formatDateForExcel(p.applicationDate), // 출원일
                    this.formatDateForExcel(p.registrationDate), // 등록일
                    this.formatDateForExcel(p.expirationDate), // 존속기간 만료일
                    p.inventionTitle || '-',
                    p.claimCount || '-',
                    p.registrationStatus || '-',
                    calculatedData.previousPaymentMonth || '-', // 직전년도 납부연월 (화면과 동일)
                    calculatedData.dueDate || '-', // 해당 연차료 납부마감일 (화면과 동일)
                    calculatedData.annualYear || '-', // 해당연차수 (화면과 동일)
                    calculatedData.annualFee || '-', // 해당연차료 (화면과 동일)
                    calculatedData.validityStatus || '-', // 유효/불납 (화면과 동일)
                    calculatedData.latePaymentPeriod || '-', // 추납기간 (화면과 동일)
                    calculatedData.recoveryPeriod || '-', // 회복기간 (화면과 동일)
                    p.businessNo || '-',  // 사업자번호
                    p.applicantCd || '-'  // 고객번호
                ];
            } else {
                return [
                    p.applicationNumber,
                    p.registrationNumber || '-',
                    p.applicantName,
                    p.inventorName,
                    this.formatDateForExcel(p.applicationDate), // 출원일
                    p.priorityApplicationDate || '-',
                    this.formatDateForExcel(p.pctDeadline), // PCT마감일
                    p.inventionTitle,
                    p.registrationStatus,
                    p.publicationFullText || '-',
                    p.announcementFullText || '-',
                    customerNumber || '-'  // 고객번호 (사용자가 입력한 고객번호)
                ];
            }
        });

        // 워크시트 생성
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        
        // 열 너비 자동 조정
        const range = XLSX.utils.decode_range(ws['!ref']);
        const wscols = [];
        
        for (let C = range.s.c; C <= range.e.c; ++C) {
            let maxWidth = 10; // 최소 너비
            
            // 헤더 길이 확인
            if (headers[C]) {
                maxWidth = Math.max(maxWidth, headers[C].length + 2);
            }
            
            // 데이터 길이 확인 (상위 10개 행만 체크)
            for (let R = 1; R <= Math.min(10, range.e.r); ++R) {
                const cellAddress = XLSX.utils.encode_cell({r: R, c: C});
                const cell = ws[cellAddress];
                if (cell && cell.v) {
                    const cellLength = String(cell.v).length;
                    maxWidth = Math.max(maxWidth, cellLength + 2);
                }
            }
            
            // 최대 너비 제한 (너무 넓어지지 않도록)
            maxWidth = Math.min(maxWidth, 50);
            
            wscols.push({wch: maxWidth});
        }
        
        ws['!cols'] = wscols;
        
        // 워크북 생성
        const wb = XLSX.utils.book_new();
        const sheetName = type === 'registered' ? '등록특허현황' : '출원특허현황';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        // Excel 버퍼 생성
        return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
    }

    // 출원번호별 특허 상세 정보 조회 (등록특허 페이지용)
    async getPatentDetailsByApplicationNumber(applicationNumber) {
        try {
            // 서지상세정보 조회를 통해 등록번호, 등록일, 존속기간만료일, 청구항수 등을 가져옴
            return await this.getBibliographyDetailInfo(applicationNumber);
        } catch (error) {
            console.error(`출원번호 ${applicationNumber} 상세 정보 조회 오류:`, error.message);
            throw error;
        }
    }

    // 출원번호 형식 변환 헬퍼 메서드 (화면 표시용 - 하이픈 포함)
    formatApplicationNumberForExcel(applicationNumber) {
        if (!applicationNumber || applicationNumber === '-') return '-';

        // 기존 하이픈이 있는 경우 그대로 반환
        if (applicationNumber.includes('-')) return applicationNumber;

        // 하이픈이 없는 경우 형식 변환 (1020160042595 -> 10-2016-0042595)
        if (applicationNumber.length === 13) {
            return applicationNumber.substring(0, 2) + '-' + applicationNumber.substring(2, 6) + '-' + applicationNumber.substring(6);
        }

        return applicationNumber;
    }

    // 엑셀용 날짜 포맷팅 메서드
    formatDateForExcel(dateStr) {
        if (!dateStr || dateStr === '-' || dateStr === '' || dateStr === null || dateStr === undefined) {
            return '-';
        }

        // 이미 YYYY.MM.DD 형식인 경우 그대로 반환
        if (typeof dateStr === 'string' && dateStr.match(/^\d{4}\.\d{2}\.\d{2}$/)) {
            return dateStr;
        }

        // YYYYMMDD 형식을 YYYY.MM.DD로 변환
        if (typeof dateStr === 'string' && dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
            return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
        }

        // YYYY-MM-DD 형식을 YYYY.MM.DD로 변환
        if (typeof dateStr === 'string' && dateStr.includes('-') && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return dateStr.replace(/-/g, '.');
        }

        // Date 객체인 경우 YYYY.MM.DD 형식으로 변환
        if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
            const year = dateStr.getFullYear();
            const month = String(dateStr.getMonth() + 1).padStart(2, '0');
            const day = String(dateStr.getDate()).padStart(2, '0');
            return `${year}.${month}.${day}`;
        }

        // 그 외의 경우 문자열로 변환해서 처리 시도
        const str = String(dateStr).trim();
        if (str && str !== '-' && str !== 'undefined' && str !== 'null') {
            // 숫자만 있는 8자리 문자열인 경우
            if (/^\d{8}$/.test(str)) {
                return `${str.substring(0, 4)}.${str.substring(4, 6)}.${str.substring(6, 8)}`;
            }
            return str;
        }

        return '-';
    }
}

module.exports = new PatentService();