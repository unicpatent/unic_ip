// public/js/tracking.js - 비회원 이용자 연락처 수집
// 1) 검색 결과 아래 "연차료 납부기한 알림 받기" 배너 → 이름/이메일 입력 (선택)
// 2) 연차료 납부의뢰 폼(Web3Forms) 제출 시 이름/이메일/연락처를 DB에도 저장
(function () {
    var STORAGE_KEY = 'unicContact';
    var isEn = function () { return window._lang === 'en'; };

    function getSaved() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; }
    }
    function setSaved(v) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch (e) {}
    }

    function sendContact(data) {
        data.lang = window._lang || 'ko';
        return fetch('/api/track/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            keepalive: true
        }).then(function (r) { return r.json(); });
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var lastCustomerNumber = '';

    // 검색 결과가 표시될 때 호출: 배너를 검색 섹션 아래에 표시
    function showAlertCta(info) {
        if (info && info.customerNumber) lastCustomerNumber = info.customerNumber;
        var banner = document.getElementById('unicAlertCta');
        if (!banner) {
            var anchor = document.querySelector('.search-section');
            if (!anchor) return;
            banner = document.createElement('div');
            banner.id = 'unicAlertCta';
            banner.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;' +
                'margin:0.75rem 0;padding:0.75rem 1rem;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:0.9rem;color:#166534;';
            anchor.parentNode.insertBefore(banner, anchor.nextSibling);
        }
        renderBanner(banner);
    }

    function renderBanner(banner) {
        var saved = getSaved();
        if (saved && saved.email) {
            banner.innerHTML = '<span>✅ ' + (isEn()
                ? 'Annuity deadline alerts will be sent to <strong>' + escapeHtml(saved.email) + '</strong>.'
                : '<strong>' + escapeHtml(saved.email) + '</strong> 으로 연차료 납부기한 알림을 보내드립니다.') + '</span>' +
                '<button type="button" id="unicAlertEdit" style="background:none;border:none;color:#166534;text-decoration:underline;cursor:pointer;font-size:0.85rem;">' +
                (isEn() ? 'Change' : '변경') + '</button>';
            document.getElementById('unicAlertEdit').onclick = openAlertModal;
        } else {
            banner.innerHTML = '<span>📩 ' + (isEn()
                ? 'Never miss an annuity deadline — get a free email reminder before it is due.'
                : '연차료 납부기한을 놓치지 않도록, 마감 전에 무료로 이메일 알림을 보내드립니다.') + '</span>' +
                '<button type="button" id="unicAlertOpen" style="padding:0.45rem 1rem;background:#54B435;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:500;white-space:nowrap;">' +
                (isEn() ? 'Get Deadline Alerts' : '납부기한 알림 받기') + '</button>';
            document.getElementById('unicAlertOpen').onclick = openAlertModal;
        }
    }

    function openAlertModal() {
        var saved = getSaved() || {};
        var en = isEn();
        var inputStyle = 'width:100%;padding:0.75rem;border:1px solid #d1d5db;border-radius:4px;box-sizing:border-box;';
        var html =
            '<div id="unicAlertModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:1000;">' +
            '<div style="background:#fff;border-radius:8px;padding:2rem;width:90%;max-width:450px;box-shadow:0 10px 25px rgba(0,0,0,0.15);">' +
            '<div style="border-bottom:2px solid #54B435;padding-bottom:1rem;margin-bottom:1.25rem;display:flex;justify-content:space-between;align-items:center;">' +
            '<h2 style="color:#0F172A;font-size:1.3rem;font-weight:700;margin:0;">' + (en ? 'Annuity Deadline Alerts' : '연차료 납부기한 알림 받기') + '</h2>' +
            '<button type="button" data-close style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#6b7280;">&times;</button></div>' +
            '<p style="color:#6b7280;font-size:0.9rem;margin:0 0 1.25rem;line-height:1.5;">' +
            (en ? 'We will email you before your patent annuity is due. No sign-up or password needed.'
                : '회원가입이나 패스워드 없이, 이메일만 남겨주시면 연차료 마감 전에 알려드립니다.') + '</p>' +
            '<form id="unicAlertForm">' +
            '<div style="margin-bottom:1rem;"><label style="display:block;color:#374151;font-weight:500;margin-bottom:0.5rem;">' + (en ? 'Name / Company' : '이름 / 회사명') + '</label>' +
            '<input type="text" id="unicAlertName" maxlength="100" style="' + inputStyle + '" value="' + escapeHtml(saved.name) + '"></div>' +
            '<div style="margin-bottom:1rem;"><label style="display:block;color:#374151;font-weight:500;margin-bottom:0.5rem;">' + (en ? 'Email' : '이메일') + ' <span style="color:#ef4444;">*</span></label>' +
            '<input type="email" id="unicAlertEmail" required maxlength="200" style="' + inputStyle + '" placeholder="example@email.com" value="' + escapeHtml(saved.email) + '"></div>' +
            '<div style="margin-bottom:1.25rem;border:1px solid #d1d5db;border-radius:4px;background:#f9fafb;padding:1rem;font-size:0.85rem;color:#6b7280;line-height:1.5;">' +
            '<p style="margin:0 0 0.4rem;"><strong>' + (en ? 'Privacy Policy Consent' : '개인정보 수집 및 이용 동의') + '</strong></p>' +
            '<p style="margin:0 0 0.4rem;">' + (en ? 'Purpose: Annuity deadline alerts and service notices' : '수집·이용 목적: 연차료 납부기한 알림 및 서비스 안내') + '</p>' +
            '<p style="margin:0 0 0.4rem;">' + (en ? 'Items: Name, Email, searched Customer No.' : '수집 항목: 이름, 이메일, 조회한 고객번호') + '</p>' +
            '<p style="margin:0 0 0.6rem;">' + (en ? 'Retention: Until you request deletion' : '보유 및 이용 기간: 삭제 요청 시까지') + '</p>' +
            '<label style="display:flex;align-items:center;color:#374151;"><input type="checkbox" id="unicAlertConsent" required style="margin-right:0.5rem;width:16px;height:16px;">' +
            (en ? 'I agree to the collection and use of personal information.' : '개인정보 수집 및 이용에 동의합니다.') + '</label></div>' +
            '<div id="unicAlertError" style="display:none;color:#ef4444;background:#fef2f2;border:1px solid #fecaca;padding:0.75rem;border-radius:4px;margin-bottom:1rem;font-size:0.9rem;"></div>' +
            '<div style="display:flex;gap:1rem;justify-content:flex-end;">' +
            '<button type="button" data-close style="padding:0.75rem 1.5rem;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:4px;cursor:pointer;font-weight:500;">' + (en ? 'Cancel' : '취소') + '</button>' +
            '<button type="submit" id="unicAlertSubmit" style="padding:0.75rem 1.5rem;background:#54B435;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:500;">' + (en ? 'Subscribe' : '알림 신청') + '</button>' +
            '</div></form></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var modal = document.getElementById('unicAlertModal');
        var close = function () { modal.remove(); };
        modal.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = close; });
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

        document.getElementById('unicAlertForm').addEventListener('submit', function (e) {
            e.preventDefault();
            var name = document.getElementById('unicAlertName').value.trim();
            var email = document.getElementById('unicAlertEmail').value.trim();
            var errorDiv = document.getElementById('unicAlertError');
            var btn = document.getElementById('unicAlertSubmit');
            btn.disabled = true;
            errorDiv.style.display = 'none';

            sendContact({
                name: name,
                email: email,
                customerNumber: lastCustomerNumber,
                source: 'alert_signup',
                privacyConsent: document.getElementById('unicAlertConsent').checked
            }).then(function (result) {
                if (!result.success) throw new Error(result.message);
                setSaved({ name: name, email: email });
                close();
                var banner = document.getElementById('unicAlertCta');
                if (banner) renderBanner(banner);
            }).catch(function (err) {
                errorDiv.textContent = (err && err.message) || (en ? 'Failed to save. Please try again.' : '저장에 실패했습니다. 다시 시도해주세요.');
                errorDiv.style.display = 'block';
                btn.disabled = false;
            });
        });
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
        if (!getSaved()) setSaved({ name: get('name'), email: get('email') });
    }, true);

    window.UnicTrack = { showAlertCta: showAlertCta };
})();
