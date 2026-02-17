# my_app/utils/common.py
import frappe
from frappe.utils import getdate

def fiscal_year_set(posting_date):

    # 2️⃣ Fiscal Year lookup in ERPNext
    fy = frappe.db.get_value(
        "Fiscal Year",
        {
            "year_start_date": ("<=", posting_date),
            "year_end_date": (">=", posting_date),
            "disabled": 0
        },
        ["name", "year_start_date", "year_end_date"],
        as_dict=True
    )

    return fy
