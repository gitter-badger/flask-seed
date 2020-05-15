const express = require('express');
const nunjucks = require('nunjucks');
const _ = require('lodash');
const Mock = require('mockjs');
const querystring = require('querystring');

const app = express();
const port = 3000;
// Use Nunjucks as express template
var env = nunjucks.configure('templates', {
    autoescape: true,
    express: app
});
app.use(express.json());
app.use(express.urlencoded({extended: false})); // NOTE: extended:true can NOT parse complicated form names, e.g. user.accounts[0].id

//
// Compatible with flask folder structure
//

// Static
app.use('/static', express.static('static'));

//
// Compatible with Jinja2's filters
//

// Jinja2's tojson filter
env.addFilter('tojson', env.dump);

//
// Compatible with Jinja2's global variables
//

// i18n function of flask-babel
env.addGlobal('_', function (str) {
    return str;
});
// User session of flask-login
var current_user = {
    is_authenticated: false,
    is_admin: true,
    head: '/static/assets/img/blog/avt-1.jpg',
    name: 'Admin',
};
env.addGlobal('current_user', current_user);
// Request level variables to all templates
app.use(function (req, res, next) {
    // Inject Request object of express, http://expressjs.com/en/api.html#req
    // Please note the difference to flask.request, https://flask.palletsprojects.com/en/1.1.x/templating/#standard-context
    env.addGlobal('request', req);

    // Update params of current url, e.g, href="{{ update_query(p=1) }}".
    // Nunjucks also support keyword arguments, https://mozilla.github.io/nunjucks/templating#keyword-arguments
    env.addGlobal('update_query', function (kwargs) {
        // Remove the __keywords params added by Nunjucks
        _.unset(kwargs, '__keywords');
        // Update current query, http://expressjs.com/en/api.html#req.query
        return req.path + '?' + querystring.stringify(_.assign(req.query, kwargs));
    });

    next();
});

//
// Compatible with Jinja2's tests
//

// Jinja2's Builtin Tests, https://jinja.palletsprojects.com/en/2.11.x/templates/#list-of-builtin-tests
env.addTest('none', function (v) {
    return _.isNull(v);
});
env.addTest('undefined', function (v) {
    return _.isUndefined(v);
});
env.addTest('defined', function (v) {
    return !_.isUndefined(v);
});

//
// Compatible with flask-seed's model definition and related crud logic
//

// Mock model's json schema is a subset of Object Schema from OAS 3.0, it is converted from app.core.schema::SchemaDict
// https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.3.md#schemaObject
// https://swagger.io/docs/specification/data-models/
var mock_models = [
    {
        'name': 'user',
        'jschema': {
            'type': 'object',
            'properties': {
                '_id': {
                    'type': 'string',
                    'format': 'ObjectId'
                },
                'name': {
                    'type': 'string'
                },
                'email': {
                    'type': 'string'
                },
                'point': {
                    'type': 'integer'
                },
                'status': {
                    'type': 'string',
                    'enum': ['normal', 'rejected']
                },
                'roles': {
                    'type': 'array',
                    'items': {
                        'type': 'integer',
                        'enum': [1, 2, 9]
                    }
                },
                'accounts': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'id': {
                                'type': 'integer'
                            },
                            'name': {
                                'type': 'string'
                            },
                            'balance': {
                                'type': 'number'
                            }
                        },
                        'required': ['id']
                    }
                },
                'createTime': {
                    'type': 'string',
                    'format': 'date-time'
                },
                'updateTime': {
                    'type': 'string',
                    'format': 'date-time'
                }
            },
            'required': ['name', 'point', 'status', 'roles', 'createTime']
        }
    }
];
var mock_model = mock_models[0], mock_model_dict = _.keyBy(mock_models, 'name');
// Mock records generation with pagination support
// About mockjs's random, https://github.com/nuysoft/Mock/wiki/Mock.Random
var mock_records = Mock.mock({
    'data|20-50': [{
        '_id': '@string("number", 24)', // NOTE: _id field should be 12-byte bson.ObjectId.
        'name': '@first',
        'email': '@email("flask-seed.com")',
        'point': '@integer(0, 100)',
        'status': '@pick(["normal", "rejected"])',
        'roles|2': ['@pick([1, 2, 9])'],
        'accounts|3': [{
            'id|+1': 1,
            'name': /act_\d{11}/,
            'balance': '@float(0, 10000, 0, 2)',
        }],
        'createTime': '@date("yyyy-MM-dd HH:mm:ss.S")'
    }]
}).data;
var mock_record_dict = _.keyBy(mock_records, '_id'), mock_page_count = 10;

function init_mock_record() {
    return Mock.mock({
        'name': '@first',
        'point': 0,
        'status': 'normal',
        'createTime': '@now("yyyy-MM-dd HH:mm:ss.S")'
    });
}

//
// Routers
//

// Index
app.get('/', function (req, res) {
    res.render('public/index.html');
});
app.get('/blank', function (req, res) {
    res.render('public/blank.html');
});

// Dashboard
app.get('/dashboard/', function (req, res) {
    res.render('dashboard/index.html');
});
app.get('/dashboard/blank', function (req, res) {
    res.render('dashboard/blank.html');
});

// CRUD
app.get('/crud/', function (req, res) {
    res.render('crud/index.html', {models: mock_models});
});
app.get('/crud/list/:modelName', function (req, res) {
    var p = parseInt(req.query.p) || 1,
        offset = (p - 1) * mock_page_count,
        mock_pages = _.ceil(mock_records.length / mock_page_count),
        records = _.drop(mock_records, offset).slice(0, mock_page_count),
        pagination = {
            'page': p,
            'pages': mock_pages,
            'prev': p <= 1 ? null : p - 1,
            'next': p >= mock_pages ? null : p + 1,
            'iter_pages': _.range(1, mock_pages + 1)
        };
    res.render('crud/list.html', {model: mock_model, records: records, pagination: pagination});
});
app.get('/crud/form/:modelName/(*)', function (req, res) {
    var recordId = req.params[0],
        record = init_mock_record();
    if (recordId) {
        record = _.get(mock_record_dict, recordId);
        if (!record) {
            res.redirect('/404');
            return;
        }
    }
    res.render('crud/form.html', {model: mock_model, record: record});
});
app.get('/crud/raw/:modelName/(*)', function (req, res) {
    var recordId = req.params[0],
        record = init_mock_record();
    if (recordId) {
        record = _.get(mock_record_dict, recordId);
        if (!record) {
            res.redirect('/404');
            return;
        }
    }
    res.render('crud/raw.html', {model: mock_model, record: record});
});
app.post('/crud/save/:modelName/(*)', function (req, res) {
    var modelName = req.params.modelName,
        model = mock_model_dict[modelName],
        recordId = req.params[0],
        record = init_mock_record();
    // Populate record
    var body = req.body, schema = model.jschema;
    _.forEach(body, function (v, k) {
        // Only check the params starts with model name
        if (k.startsWith(modelName)) {
            // Convert paths, e.g, user.accounts[0].id -> [accounts, 0, id]
            var segments = k.replace(/\[/, '.').replace(/\]/, '').split('.').slice(1);
            // Get schema of a path
            // NOTE: We only support very simple keywords of json schema here as it is generated from app.core.schema::SchemaDict.
            // There should be no keywords such as oneOf, $ref, patternProperties, additionalProperties, etc.
            var sub = _.reduce(segments, function (result, segment) {
                if (result.type == 'object') {
                    return _.get(result, 'properties.' + segment);
                } else if (result.type == 'array') {
                    return _.get(result, 'items');
                } else {
                    return result;
                }
            }, schema);
            var type = sub.type, value = v;
            if (type == 'integer') {
                value = parseInt(v)
            } else if (type == 'number') {
                value = parseFloat(v);
            } else if (type == 'boolean') {
                value = 'true' == v.lower() ? true : false;
            }
            _.set(record, segments, value);
            console.log(record);
        }
    });
    if (recordId) { // Update
        var existing = _.get(mock_record_dict, recordId);
        if (!existing) {
            res.redirect('/404');
            return;
        }
        _.assign(existing, record) // Overwrite the whole record
    } else { // Create
        recordId = Mock.mock('@string("number", 24)');
        record._id = recordId;
        mock_records.push(record);
        mock_record_dict[recordId] = record;
    }
    res.json({success: true, message: 'Save successfully.', rid: recordId});
});
app.post('/crud/delete/:modelName/:recordId', function (req, res) {
    var record = _.get(mock_record_dict, req.params.recordId);
    if (!record) {
        res.redirect('/404');
        return;
    }
    // Remove from records
    _.remove(mock_records, function (n) {
        return n._id == record._id;
    });
    // Remove from hash
    _.unset(mock_record_dict, record._id);
    res.json({success: true, message: 'Delete successfully.'});
});
app.get('/crud/json/:modelName/:recordId', function (req, res) {
    var record = _.get(mock_record_dict, req.params.recordId);
    if (!record) {
        res.redirect('/404');
        return;
    }
    res.json(record);
});

// Login
app.get('/login', function (req, res) {
    res.render('public/login.html');
});
app.post('/login', function (req, res) {
    current_user['is_authenticated'] = true;
    res.redirect('/dashboard/');
});

// Logout
app.get('/logout', function (req, res) {
    current_user['is_authenticated'] = false;
    res.redirect('/');
});

// Signup
app.get('/signup', function (req, res) {
    res.render('public/signup.html');
});
app.post('/signup', function (req, res) {
    current_user['is_authenticated'] = true;
    res.redirect('/dashboard/');
});

// Errors
app.get('/400', function (req, res) {
    var error = {
        'status': 400,
        'title': 'Invalid Request',
        'content': 'Unexpected request received!'
    };
    if (req.xhr) {
        res.send({success: false, message: error.content + '(' + error.status + ')'});
        return;
    }
    res.status(400).render('public/error.html', {error: error});
});
app.get('/403', function (req, res) {
    var error = {
        'status': 403,
        'title': 'Permission Denied',
        'content': 'Not allowed or forbidden!'
    };
    if (req.xhr) {
        res.send({success: false, message: error.content + '(' + error.status + ')'});
        return;
    }
    res.status(403).render('public/error.html', {error: error});
});
app.get('/500', function (req, res) {
    throw new Error()
});
app.use(function (req, res, next) {
    var error = {
        'status': 404,
        'title': 'Page Not Found',
        'content': 'The requested URL was not found on this server!'
    };
    if (req.xhr) {
        res.send({success: false, message: error.content + '(' + error.status + ')'});
        return;
    }
    res.status(404).render('public/error.html', {error: error});
});
app.use(function (err, req, res, next) {
    console.error(err.stack);
    var error = {
        'status': 500,
        'title': 'Internal Server Error',
        'content': 'Unexpected error occurred! Please try again later.'
    };
    if (req.xhr) {
        res.send({success: false, message: error.content + '(' + error.status + ')'});
        return;
    }
    res.status(500).render('public/error.html', {error: error});
});

//
// Run
//

app.listen(port, () => console.log(`ui is listening on port ${port}!`));