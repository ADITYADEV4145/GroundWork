import sys
import app.models as m
from app.services.billing import charge
from app.services import tax


def main(argv=None):
    inv = m.Invoice("c1", [1.0, 2.0])
    print(charge(inv, region="us"), tax.rate("us"))
    cust = m.Customer.parse(argv or sys.argv[1])
    return cust


if __name__ == "__main__":
    main()
