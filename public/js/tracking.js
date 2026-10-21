// public/js/tracking.js - 비회원 이용자 연락처 수집
// 연차료 납부의뢰 폼(Web3Forms) 제출 시 이름/이메일/연락처를 DB에도 저장
(function () {
    function sendContact(data) {
        data.lang = window._lang || 'ko';
        return fetch('/api/track/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            keepalive: true
        }).then(function (r) { return r.json(); });
    }

    // 연차료 납부의뢰 폼 제출 시 연락처를 DB에도 저장 (폼은 기존대로 Web3Forms로 전송)
    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || form.id !== 'renewalRequestForm') return;
        var get = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
        var consent = form.querySelector('[name="privacy_consent"]');
        if (!get('email') || (consent && !consent.checked)) return;
        sendContact({
            name: get('name'),
            email: get('email'),
            phone: get('phone'),
            customerNumber: get('customer_number'),
            source: 'renewal_request',
            privacyConsent: true
        }).catch(function () {});
    }, true);
})();
