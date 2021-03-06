# -*- coding: utf-8 -*-
"""
    test_schema
    ~~~~~~~~~~~~~~

    Test cases for schema.

    :copyright: (c) 2019 by weiminfeng.
    :date: 2019/11/4
"""
from datetime import datetime

import pytest

from app.core import SimpleEnum, SchemaDict, SeedDataError


class TestStatus(SimpleEnum):
    NORMAL = 'normal'
    REJECTED = 'rejected'


class TestRole(SimpleEnum):
    MEMBER = 1
    EDITOR = 2
    ADMIN = 9


class UserDict(SchemaDict):
    schema = {
        'name': str,
        'point': int,
        'status': TestStatus,
        'roles': [TestRole],
        'accounts': [{
            'id': int,
            'name': str,
            'balance': float,
        }],
        'logins': [{
            'ip': str,
            'time': datetime
        }],
        'createTime': datetime,
        'updateTime': datetime
    }
    required_fields = [
        'name', 'point', 'status', 'roles', 'createTime',
        'accounts', 'accounts[].id',
        'logins[].ip', 'logins[].time'
    ]
    default_values = {
        'point': 0,
        'status': TestStatus.NORMAL,
        'roles': [TestRole.MEMBER],
        'accounts[].balance': 0.0,
        'createTime': datetime.now
    }


def test_schema_dict(app):
    ud = UserDict()

    # Test default values
    assert ud.point == 0
    assert ud['point'] == 0
    assert ud.status == TestStatus.NORMAL
    assert ud.roles[0] == TestRole.MEMBER
    assert ud.accounts[0].balance == 0.0

    # Test validate
    with pytest.raises(SeedDataError, match='name') as excinfo:
        ud.validate()
    # print(excinfo.value)
    ud.name = 'test'

    with pytest.raises(SeedDataError, match='accounts\[\]\.id') as excinfo:
        ud.validate()
    # print(excinfo.value)
    ud.accounts[0].id = 0

    ud.status = 'DELETED'
    with pytest.raises(SeedDataError, match='status') as excinfo:
        ud.validate()
    # print(excinfo.value)
    ud.status = TestStatus.NORMAL

    # Because logins is empty, so the required rules for logins[].ip is not executed
    assert ud.validate() is True

    ud.logins = [{'ip': '127.0.0.1'}]
    with pytest.raises(SeedDataError, match='logins\[\]\.time') as excinfo:
        ud.validate()
    # print(excinfo.value)
    ud.logins[0].time = datetime.now()

    assert ud.validate() is True

    # Test json
    td_json = ud.to_json()
    td2 = UserDict.from_json(td_json)
    assert ud.createTime == td2.createTime
