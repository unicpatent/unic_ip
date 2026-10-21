// public/js/annuity.js - 연차료 계산 공용 로직 (등록특허 현황 화면 + 관리자 납부기한 알림 메일에서 함께 사용)
// 브라우저: window.UnicAnnuity / 서버: require('../public/js/annuity')
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.UnicAnnuity = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    // 특허 연차료 기본료 테이블 (등록번호 '10'으로 시작)
    const PATENT_BASE_FEES = {
        1: 13000,   2: 13000,   3: 13000,        // 1~3년차: 13,000원
        4: 36000,   5: 36000,   6: 36000,        // 4~6년차: 36,000원
        7: 90000,   8: 90000,   9: 90000,        // 7~9년차: 90,000원
        10: 216000, 11: 216000, 12: 216000,      // 10~12년차: 216,000원
        13: 324000, 14: 324000, 15: 324000,      // 13~25년차: 324,000원
        16: 324000, 17: 324000, 18: 324000,
        19: 324000, 20: 324000, 21: 324000, 22: 324000, 23: 324000, 24: 324000, 25: 324000
    };

    // 특허 청구항 가산료 테이블 (등록번호 '10'으로 시작)
    const PATENT_CLAIM_FEES = {
        1: 12000,   2: 12000,   3: 12000,        // 1~3년차: 12,000원
        4: 20000,   5: 20000,   6: 20000,        // 4~6년차: 20,000원
        7: 34000,   8: 34000,   9: 34000,        // 7~9년차: 34,000원
        10: 49000,  11: 49000,  12: 49000,       // 10~12년차: 49,000원
        13: 49000,  14: 49000,  15: 49000,       // 13~25년차: 49,000원
        16: 49000,  17: 49000,  18: 49000,
        19: 49000,  20: 49000,  21: 49000, 22: 49000, 23: 49000, 24: 49000, 25: 49000
    };

    // 실용신안 연차료 기본료 테이블 (등록번호 '20'으로 시작)
    const UM_BASE_FEES = {
        1: 12000,   2: 12000,   3: 12000,        // 1~3년차: 12,000원
        4: 25000,   5: 25000,   6: 25000,        // 4~6년차: 25,000원
        7: 60000,   8: 60000,   9: 60000,        // 7~9년차: 60,000원
        10: 160000, 11: 160000, 12: 160000,      // 10~12년차: 160,000원
        13: 240000, 14: 240000, 15: 240000       // 13~15년차: 240,000원
    };

    // 실용신안 청구항 가산료 테이블 (등록번호 '20'으로 시작)
    const UM_CLAIM_FEES = {
        1: 4000,    2: 4000,    3: 4000,         // 1~3년차: 4,000원
        4: 9000,    5: 9000,    6: 9000,         // 4~6년차: 9,000원
        7: 14000,   8: 14000,   9: 14000,        // 7~9년차: 14,000원
        10: 20000,  11: 20000,  12: 20000,       // 10~12년차: 20,000원
        13: 20000,  14: 20000,  15: 20000        // 13~15년차: 20,000원
    };

    // 감면 유형 정의
    const DISCOUNT_TYPES = {
        'type1': {
            name: '개인/중소기업/공공연구기관/전담조직/지방자치단체',
            rate: 0.5,  // 50% 감면 (4년차부터 존속기간까지)
            description: '개인, 중소기업, 공공연구기관, 전담조직, 지방자치단체 등이 해당됩니다.',
            applicableFromYear: 4
        },
        'type1_1': {
            name: '중소기업 + 직무발명보상우수기업/지식재산경영인증기업',
            rate: 0.7,  // 4~9년차 70% 감면, 10년차부터 50% 감면
            rate10Plus: 0.5,  // 10년차부터는 50% 감면
            description: '중소기업이면서 직무발명보상우수기업 또는 지식재산경영인증기업입니다.',
            applicableFromYear: 4
        },
        'type2': {
            name: '중견기업',
            rate: 0.3,  // 30% 감면 (4~9년차)
            description: '중견기업입니다.',
            applicableFromYear: 4,
            applicableToYear: 9
        },
        'type2_1': {
            name: '중견기업 + 직무발명보상우수기업/지식재산경영인증기업',
            rate: 0.5,  // 50% 감면 (4~9년차)
            description: '중견기업이면서 직무발명보상우수기업 또는 지식재산경영인증기업입니다.',
            applicableFromYear: 4,
            applicableToYear: 9
        },
        'none': {
            name: '해당사항 없음',
            rate: 0,
            description: '감면 대상이 아닙니다.',
            applicableFromYear: 1
        }
    };

    const DEFAULT_DISCOUNT_TYPE = 'type1';

    // 등록번호로 실용신안 여부 판별 (앞 2자리가 '20'이면 실용신안)
    function isUtilityModel(registrationNumber) {
        if (!registrationNumber) return false;
        const cleanedNo = String(registrationNumber).replace(/-/g, '');
        return cleanedNo.substring(0, 2) === '20';
    }

    // 등록번호에 따른 최대 존속기간 반환 (특허: 25년, 실용신안: 15년)
    function getMaxYear(registrationNumber) {
        return isUtilityModel(registrationNumber) ? 15 : 25;
    }

    // 'YYYY.MM.DD' (또는 YYYY-MM-DD) → 로컬 자정 Date
    function parseDate(str) {
        const m = /^(\d{4})\D(\d{2})\D(\d{2})/.exec(String(str || ''));
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    }

    // Date → 'YYYY.MM.DD'
    function formatDate(d) {
        return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    }

    function addMonths(d, months) {
        const r = new Date(d);
        r.setMonth(r.getMonth() + months);
        return r;
    }

    // 해당 연차의 연차료 계산 (기본료 + 청구항 가산료, 감면 적용)
    function calculateFee(annualYear, claimCount, discountType, registrationNumber) {
        // 1. 기본료 계산 (실용신안/특허 구분)
        const isUM = isUtilityModel(registrationNumber);
        const maxYear = isUM ? 15 : 25;
        const baseFeeTable = isUM ? UM_BASE_FEES : PATENT_BASE_FEES;
        const claimFeeTable = isUM ? UM_CLAIM_FEES : PATENT_CLAIM_FEES;
        const baseFee = baseFeeTable[annualYear] || baseFeeTable[maxYear];

        // 2. 청구항 가산료 계산
        const claimFeePerItem = claimFeeTable[annualYear] || claimFeeTable[maxYear];
        const claims = Math.max(1, parseInt(claimCount) || 1);
        const claimSurchargeFee = claimFeePerItem * claims;

        // 3. 정상 연차료 = 기본료 + 청구항 가산료
        const normalFee = baseFee + claimSurchargeFee;

        // 4. 감면율 적용
        let discountRate = 0;
        const discount = DISCOUNT_TYPES[discountType];

        if (discount && annualYear >= discount.applicableFromYear) {
            // 감면 적용 가능한 연차인지 확인
            const isApplicable = !discount.applicableToYear || annualYear <= discount.applicableToYear;

            if (isApplicable) {
                // 유형1-1의 경우 10년차 이후 감면율 변경
                if (discountType === 'type1_1' && annualYear >= 10) {
                    discountRate = discount.rate10Plus;
                } else {
                    discountRate = discount.rate;
                }
            }
        }

        // 5. 감면 연차료 계산 (추납/회복 가산금은 포함하지 않음)
        const discountedFee = Math.round(normalFee * (1 - discountRate));

        return {
            baseFee: baseFee,
            claimSurchargeFee: claimSurchargeFee,
            normalFee: normalFee,
            discountRate: discountRate,
            discountedFee: discountedFee,
            additionalFee: 0,
            totalFee: discountedFee
        };
    }

    // 특허 1건의 다음 납부 연차 계산
    // patent: { registrationStatus, registrationDate('YYYY.MM.DD'), registrationNumber, claimCount, paymentHistory: { lastAnnl } }
    // 반환 status: 'inactive'(등록유지 아님) | 'noRegDate' | 'expired' | 'due'
    function calculatePatent(patent, discountType, today) {
        today = today || new Date();

        // 등록상태가 '등록유지'인 경우에만 연차료 계산
        if (patent.registrationStatus !== '등록유지') return { status: 'inactive' };

        const registrationDate = parseDate(patent.registrationDate);
        if (!registrationDate) return { status: 'noRegDate' };

        // 3년 업프론트 납부 규칙: 등록일 + 3년부터 4년차 연차료 납부
        const threeYearsAfterRegistration = new Date(registrationDate);
        threeYearsAfterRegistration.setFullYear(threeYearsAfterRegistration.getFullYear() + 3);

        let annualYear;
        let isUnpaid = false;
        const lastPaidYear = patent.paymentHistory && patent.paymentHistory.lastAnnl && patent.paymentHistory.lastAnnl !== '-'
            ? parseInt(patent.paymentHistory.lastAnnl)
            : null;

        if (today < threeYearsAfterRegistration) {
            // 등록일 + 3년 이전: 해당연차수 4년차, 납부마감일 = 등록일 + 3년
            annualYear = 4;
        } else {
            // 현재 연차수 계산 (4년차부터 시작) → 다음 연차수 (1년 앞서서 납부하는 개념)
            const currentYear = Math.floor((today.getTime() - threeYearsAfterRegistration.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) + 4;
            annualYear = currentYear + 1;

            // 해당연차수 - 직전년도 연차수 = 2 이면 미납 상태 → 해당연차수 조정
            if (lastPaidYear !== null && annualYear - lastPaidYear === 2) {
                isUnpaid = true;
                annualYear = annualYear - 1;
            }

            // 연차수가 최대연차를 초과하면 특허 만료
            if (annualYear > getMaxYear(patent.registrationNumber)) return { status: 'expired' };
        }

        // 납부 마감일 = 등록일 + (연차수 - 1)년
        const dueDate = new Date(registrationDate);
        dueDate.setFullYear(registrationDate.getFullYear() + annualYear - 1);

        return {
            status: 'due',
            annualYear: annualYear,
            isUnpaid: isUnpaid,
            // 이미 해당 연차까지 납부한 경우 (선납)
            alreadyPaid: lastPaidYear !== null && lastPaidYear >= annualYear,
            isOverdue: today > dueDate,
            dueDate: dueDate,
            latePaymentEnd: addMonths(dueDate, 6),  // 추납기간: 납부 마감일 + 6개월
            recoveryEnd: addMonths(dueDate, 9),     // 회복기간: 납부 마감일 + 9개월 (추납기간 + 3개월)
            fee: calculateFee(annualYear, patent.claimCount || 1, discountType, patent.registrationNumber)
        };
    }

    // 납부기한 알림 대상 구분: 오늘 기준 months개월 이내에 납부마감 / 추납 마감 / 회복 마감이 도래하는지
    // 반환: { type: 'due' | 'late' | 'recovery', deadline: Date } 또는 null
    function getReminderCategory(result, today, months) {
        if (!result || result.status !== 'due' || result.alreadyPaid) return null;
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const limit = addMonths(start, months || 6);
        const within = d => d >= start && d <= limit;

        if (within(result.dueDate)) return { type: 'due', deadline: result.dueDate };
        if (result.dueDate < start && within(result.latePaymentEnd)) return { type: 'late', deadline: result.latePaymentEnd };
        if (result.latePaymentEnd < start && within(result.recoveryEnd)) return { type: 'recovery', deadline: result.recoveryEnd };
        return null;
    }

    return {
        DISCOUNT_TYPES: DISCOUNT_TYPES,
        DEFAULT_DISCOUNT_TYPE: DEFAULT_DISCOUNT_TYPE,
        isUtilityModel: isUtilityModel,
        getMaxYear: getMaxYear,
        parseDate: parseDate,
        formatDate: formatDate,
        addMonths: addMonths,
        calculateFee: calculateFee,
        calculatePatent: calculatePatent,
        getReminderCategory: getReminderCategory
    };
});
