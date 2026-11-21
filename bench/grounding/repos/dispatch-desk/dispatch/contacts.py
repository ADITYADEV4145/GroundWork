from .models import Customer

def get_primary_email(customer: Customer) -> str:
    return customer.email.strip().lower()

def get_billing_email(customer: Customer) -> str:
    return customer.billing_email.strip().lower()
