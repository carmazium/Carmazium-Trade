#!/usr/bin/env python3
from pathlib import Path
import runpy

service_path = Path('backend/src/payments/payments.service.ts')
service = service_path.read_text(encoding='utf-8')

# The original assertion script expected a literal backslash before the quotes
# in the createPaymentSheet NotFoundException. The TypeScript source correctly
# contains ordinary double quotes inside a template literal. Normalise only
# that one audited method long enough for the assertion transform to match;
# the transform replaces the whole method immediately afterwards.
method_marker = '    async createPaymentSheet('
method_start = service.find(method_marker)
if method_start < 0:
    raise SystemExit('createPaymentSheet marker not found')

needle = 'throw new NotFoundException(`Listing "${listingId}" not found`);'
replacement = 'throw new NotFoundException(`Listing \\"${listingId}\\" not found`);'
match = service.find(needle, method_start)
if match < 0:
    raise SystemExit('createPaymentSheet NotFoundException marker not found')

service = service[:match] + replacement + service[match + len(needle):]
service_path.write_text(service, encoding='utf-8')

runpy.run_path('scripts/release-audit-payment-fixes.py', run_name='__main__')
