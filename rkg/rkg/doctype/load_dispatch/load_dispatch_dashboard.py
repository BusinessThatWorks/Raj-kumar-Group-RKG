from frappe import _

def get_data():
    return {
        "fieldname": "custom_load_dispatch",
        "transactions": [
            {
                "label": _("Related"),
                "items": [
                    "Purchase Receipt",
                ],
            }
        ],
    }
