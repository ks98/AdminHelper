# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""SQL-side pagination for list endpoints (audit P4, target 250-500 servers).

limit=None keeps the legacy behaviour (return all rows) so existing frontends
need no change; X-Total-Count always carries the pre-pagination total so a
future UI can paginate without a response-body change.
"""

from fastapi import Response
from sqlalchemy.orm import Query


def paginate(query: Query, response: Response, limit: int | None, offset: int) -> Query:
    """Stamps X-Total-Count on the response, then applies LIMIT/OFFSET in SQL.

    Must be called AFTER all filters/scoping (the count has to reflect what the
    caller may see, not the full table) and after order_by (pages are only
    stable with a deterministic ordering).
    """
    response.headers["X-Total-Count"] = str(query.order_by(None).count())
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query
