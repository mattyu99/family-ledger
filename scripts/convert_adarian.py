import csv, io, json, uuid, datetime

# Read 25981.csv
with open('/home/myu/family-ledger/25981.csv', 'r', encoding='utf-16', errors='replace') as f:
    text = f.read()

# Fix header and inch mark quotes
text = text.replace('\u0a0d', '\r\n')
text = text.replace('Sony 50\" LED TV', 'Sony 50吋 LED TV')
text = text.replace('Ultra 6\"\"', 'Ultra 6吋\"')
text = text.replace('Philips 55\" 液晶顯示器', 'Philips 55吋 液晶顯示器')
text = text.replace('PHILIPS 75\"4K電視', 'PHILIPS 75吋 4K電視')

reader = csv.reader(io.StringIO(text))
header = next(reader)
rows = list(reader)

print(f"Total rows to convert: {len(rows)}")

# Member IDs
MEMBER_ZHI_ID = str(uuid.uuid4())
MEMBER_YING_ID = str(uuid.uuid4())

members = [
    {
        "id": MEMBER_ZHI_ID,
        "display_name": "智",
        "avatar_url": "👨",
        "role": "owner"
    },
    {
        "id": MEMBER_YING_ID,
        "display_name": "瑩",
        "avatar_url": "👩",
        "role": "member"
    }
]

# Process Accounts
raw_accounts = sorted(list(set(r[5] for r in rows if r[5])))
account_map = {}
payment_accounts = []

def detect_acc_type(name):
    lower = name.lower()
    if any(k in name for k in ['悠遊卡', '一卡通', 'icash', '街口', 'line pay', '全支付', '儲值金', '錢包', '點數', '紅利', '購物金', 'point', 'p幣', 'uupon', '福利點', '好康點']):
        return 'stored_value' if any(k in name for k in ['悠遊', '一卡通', 'icash', '街口', 'line', '全支付', '儲值金', '錢包']) else 'other'
    if any(k in name for k in ['卡', 'visa', 'master', 'jcb', 'costco']):
        return 'credit_card'
    if any(k in name for k in ['現金', '零錢']):
        return 'cash'
    if any(k in name for k in ['銀行', '郵局', '大戶', 'richart', 'koko', 'ileo', '心幸福', '帳戶']):
        return 'bank'
    return 'other'

def detect_acc_icon(acc_type, name):
    if acc_type == 'credit_card': return '💳'
    if acc_type == 'cash': return '💵'
    if acc_type == 'bank': return '🏦'
    if '悠遊' in name or '一卡通' in name or 'icash' in name: return '🚌'
    if '點' in name or '幣' in name or '金' in name: return '🪙'
    return '💳'

def detect_acc_color(acc_type, name):
    if acc_type == 'credit_card': return '#4F46E5'
    if acc_type == 'cash': return '#10B981'
    if acc_type == 'bank': return '#3B82F6'
    if acc_type == 'stored_value': return '#F59E0B'
    return '#6B7280'

for idx, acc_name in enumerate(raw_accounts):
    acc_id = str(uuid.uuid4())
    account_map[acc_name] = acc_id
    acc_type = detect_acc_type(acc_name)
    user_id = MEMBER_YING_ID if acc_name.endswith('-瑩') else (MEMBER_ZHI_ID if acc_name.endswith('-智') else MEMBER_ZHI_ID)
    payment_accounts.append({
        "id": acc_id,
        "name": acc_name,
        "type": acc_type,
        "user_id": user_id,
        "last_four_digits": "",
        "billing_cycle_date": 1,
        "balance": 0,
        "color": detect_acc_color(acc_type, acc_name),
        "icon": detect_acc_icon(acc_type, acc_name),
        "sort_order": idx + 1
    })

print(f"Created {len(payment_accounts)} payment accounts")

# Process Categories
raw_cats = sorted(list(set(r[3] for r in rows if r[3] and not (r[3].startswith('[') and r[3].endswith(']')))))
category_map = {}
categories = []

def detect_cat_icon(cat):
    if '油' in cat: return '⛽'
    if '停車' in cat: return '🅿️'
    if '交通' in cat: return '🚗'
    if '午餐' in cat or '晚餐' in cat or '早餐' in cat: return '🍱'
    if '零食' in cat or '飲料' in cat: return '🧋'
    if '餐飲' in cat or '食品' in cat: return '🍜'
    if '水' in cat: return '💧'
    if '電' in cat: return '⚡'
    if '瓦斯' in cat: return '🔥'
    if '電話' in cat or '手機' in cat or '網路' in cat: return '📱'
    if '帳單' in cat: return '📄'
    if '3c' in cat or '家電' in cat: return '💻'
    if '書' in cat: return '📚'
    if '電影' in cat or '娛樂' in cat or '休閒' in cat: return '🎬'
    if '醫' in cat or '藥' in cat: return '💊'
    if '保險' in cat or '稅' in cat: return '🛡️'
    if '薪' in cat or '收入' in cat or '獎金' in cat: return '💰'
    if '禮' in cat or '紅包' in cat: return '🎁'
    if '服飾' in cat or '鞋' in cat: return '👕'
    if '日用' in cat or '雜支' in cat: return '🛒'
    return '📝'

def detect_cat_color(cat):
    if '餐飲' in cat: return '#F59E0B'
    if '交通' in cat: return '#3B82F6'
    if '帳單' in cat or '水' in cat or '電' in cat: return '#10B981'
    if '休閒' in cat or '3c' in cat: return '#8B5CF6'
    if '醫' in cat: return '#EF4444'
    if '薪' in cat or '收入' in cat: return '#10B981'
    return '#6B7280'

for idx, cat_name in enumerate(raw_cats):
    cat_id = str(uuid.uuid4())
    category_map[cat_name] = cat_id
    clean_name = cat_name if cat_name != '--Split--' else '拆帳/綜合'
    is_income = any(k in cat_name for k in ['收入', '薪資', '獎金', '利息', '回饋', '退稅'])
    categories.append({
        "id": cat_id,
        "name": clean_name,
        "icon": detect_cat_icon(cat_name),
        "color": detect_cat_color(cat_name),
        "type": "income" if is_income else "expense",
        "sort_order": idx + 1
    })

# Add a default category for empty or transfers
DEFAULT_EXPENSE_CAT_ID = str(uuid.uuid4())
categories.append({
    "id": DEFAULT_EXPENSE_CAT_ID,
    "name": "日常支出",
    "icon": "📝",
    "color": "#6B7280",
    "type": "expense",
    "sort_order": len(categories) + 1
})
DEFAULT_INCOME_CAT_ID = str(uuid.uuid4())
categories.append({
    "id": DEFAULT_INCOME_CAT_ID,
    "name": "日常收入",
    "icon": "💰",
    "color": "#10B981",
    "type": "income",
    "sort_order": len(categories) + 1
})
DEFAULT_TRANSFER_CAT_ID = str(uuid.uuid4())
categories.append({
    "id": DEFAULT_TRANSFER_CAT_ID,
    "name": "帳戶轉帳",
    "icon": "🔄",
    "color": "#6366F1",
    "type": "expense",
    "sort_order": len(categories) + 1
})

print(f"Created {len(categories)} categories")

# Payment Methods mapping
def detect_payment_method(pay_type, acc_name):
    t = pay_type.lower() if pay_type else ''
    acc = acc_name.lower() if acc_name else ''
    if '刷卡' in t or '信用卡' in t or '分期' in t: return 'credit_card'
    if '付現' in t or '現金' in t: return 'cash'
    if 'line' in t or 'line' in acc: return 'line_pay'
    if '悠遊' in t or '悠遊' in acc or '一卡通' in t or '一卡通' in acc or 'icash' in t: return 'stored_value'
    if '轉' in t or '提款' in t or '取款' in t or '存款' in t or '金融卡' in t: return 'bank'
    if '街口' in t or '街口' in acc: return 'jkopay'
    if '全支付' in t or 'pxpay' in t or '全支付' in acc: return 'pxpay'
    return 'other'

transactions = []
for idx, r in enumerate(rows):
    # r[0]: Type, r[1]: Status, r[2]: Date, r[3]: Category, r[4]: Amount, r[5]: Account, r[6]: Payee, r[13]: Note
    pay_type = r[0]
    date_str = r[2]
    cat_str = r[3]
    amt = float(r[4])
    acc_name = r[5]
    payee = r[6].strip() if len(r) > 6 and r[6] else ""
    note = r[13].strip() if len(r) > 13 and r[13] else ""
    class_str = r[7].strip() if len(r) > 7 and r[7] else ""
    if class_str and class_str != '--Split--':
        note = f"[{class_str}] {note}".strip()
    
    # ISO Date: YYYY/M/D -> YYYY-MM-DDTHH:mm:ss.000Z
    parts = date_str.split('/')
    y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    iso_date = f"{y:04d}-{m:02d}-{d:02d}T12:00:00.000Z"
    
    # Transaction Type
    is_transfer = (cat_str.startswith('[') and cat_str.endswith(']')) or pay_type in ['提款', '存款', '取款', '轉出', '轉入', '信用卡費', '儲值']
    if is_transfer:
        tx_type = 'transfer'
        cat_id = DEFAULT_TRANSFER_CAT_ID
    elif amt < 0:
        tx_type = 'expense'
        cat_id = category_map.get(cat_str, DEFAULT_EXPENSE_CAT_ID)
    else:
        tx_type = 'income'
        cat_id = category_map.get(cat_str, DEFAULT_INCOME_CAT_ID)
        
    acc_id = account_map.get(acc_name, None)
    payer_id = MEMBER_YING_ID if acc_name.endswith('-瑩') else MEMBER_ZHI_ID
    
    tx_id = str(uuid.uuid4())
    transactions.append({
        "id": tx_id,
        "amount": round(abs(amt), 2),
        "type": tx_type,
        "category_id": cat_id,
        "paid_by": payer_id,
        "transacted_at": iso_date,
        "merchant": payee if payee else None,
        "note": note,
        "payment_method": detect_payment_method(pay_type, acc_name),
        "account_id": acc_id,
        "is_reconciled": False,
        "is_settled": False
    })

print(f"Successfully processed {len(transactions)} transactions!")

backup_data = {
    "app": "甜心記帳本",
    "version": "1.0.5.40",
    "exported_at": datetime.datetime.now().isoformat(),
    "ledger": {
        "id": str(uuid.uuid4()),
        "name": "Adarian 歷史帳本",
        "invite_code": "HIST-2026",
        "is_read_only": True
    },
    "members": members,
    "categories": categories,
    "payment_accounts": paymentAccounts if 'paymentAccounts' in locals() else payment_accounts,
    "transactions": transactions,
    "recurring_rules": [],
    "payment_methods": []
}

out_path = '/home/myu/family-ledger/adarian_history_backup.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(backup_data, f, ensure_ascii=False, indent=2)

print(f"Output saved to {out_path}!")
