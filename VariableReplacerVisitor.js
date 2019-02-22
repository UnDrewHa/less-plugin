var lodash = require('lodash');
var makeFullMap = require('./makeFullMap');

/*
@width: 20px; <------------- Rule

.set-width (@w: 20px) { <--- MixinDefinition start
    width: @w; <------------ Rule
} <------------------------- MixinDefinition end

.bordered { <--------------- Ruleset start
    width: @width; <-------- Rule
    .foo(@width, 900); <---- MixinCall
} <------------------------- Ruleset end

@media (min-width: @w) { <-- Media start
    margin: 10px; <--------- Rule
} <------------------------- Media end

@width; <------------------- Variable
sqrt(@width); <------------- Call(Variable)
10px 20px; <---------------- Anonymous
10px + 20px; <-------------- Operation("+", [Dimension, Dimension])
-@width; <------------------ Negative(Variable)

 */
function VariableReplacerVisitor(less, config) {
    var visitorConfig = config || {};

    /**
     * Флаг, означающий, что данный Visitor работает именно с less кодом до его компиляции в css.
     *
     * @type {boolean}
     */
    this.isPreEvalVisitor = true;

    /**
     * Мапа переменных, подлежащих замене.
     * @private
     */
    this._variables = visitorConfig.variables || {};
    /**
     * Мапа новых блоков объявлений в зависимости от названия класса из конфига.
     * @private
     */
    this._newRulesetsByClassName = {};
    /**
     * Находимся ли мы внутри узла с типом Ruleset.
     * Для редактирования только внутри узла с типом Ruleset.
     *
     * @type {boolean}
     * @private
     */
    this._insideRuleset = false;
    /**
     * Находимся ли мы внутри узла с типом MixinDefinition.
     * Внутри MixinDefinition не должно быть обработки узлов с типом Rule.
     */
    this._insideMixinDefinition = false;
    /**
     * Название свойства, для которого происходит поиск переменной на замену.
     * @private
     */
    this._ruleName = null;
    /**
     * Ссылка на предыдущее объявление.
     * @private
     */
    this._prevRule = null;
    /**
     * Ссылка на экземпляр LESS.
     * @private
     */
    this._less = less;

    this._classNamesMap = {};
}

/**
 * Метод, начинающий обход дерева.
 *
 * @param rootNode Корневой узел. node_modules/less/lib/less/tree/ruleset.js
 */
VariableReplacerVisitor.prototype.run = function (rootNode) {
    (new this._less.visitors.Visitor(this)).visit(rootNode);
};

/**
 * Начало обхода узла с типом Ruleset.
 *
 * @param ruleset Блок объявления. node_modules/less/lib/less/tree/ruleset.js
 */
VariableReplacerVisitor.prototype.visitRuleset = function (ruleset) {
    var _this = this;
    /**
     * Данный метод срабатывает и для корневого узла, поэтому флаг _insideRuleset вычисляем на
     * основе наличия свойства root, чтобы в дальнейшем обрабатывать узлы типа Rule только внутри узлов Ruleset.
     */
    this._insideRuleset = !ruleset.root;

    if (_this._prevRule) {
        _this._appendNewRulesets(_this._prevRule);

        _this._newRulesetsByClassName = {};
    }

    this._prevRule = !ruleset.root ? ruleset : null;
};

/**
 * Завершение обхода узла с типом Ruleset.
 *
 * @param ruleset Блок объявления. node_modules/less/lib/less/tree/ruleset.js
 */
VariableReplacerVisitor.prototype.visitRulesetOut = function (ruleset) {
    var _this = this;

    if (_this._prevRule) {
        _this._appendNewRulesets(ruleset);
    }

    _this._prevRule = null;
    _this._newRulesetsByClassName = {};
};

/**
 * Начало обхода узла с типом MixinCall.
 *
 * @param mixinCall Миксин. node_modules/less/lib/less/tree/mixin-call.js
 */
VariableReplacerVisitor.prototype.visitMixinCall = function (mixinCall) {
    return; //TODO: Под вопросом обработка миксинов внутри Ruleset
    if (!this._insideRuleset) return;

    var newMixinCall = this._mixinCallValueResolver(mixinCall);

    if (this._rulesetClassName) {
        this._addItemToNewRuleset(newMixinCall, this._rulesetClassName);
    }
};

/**
 * Начало обхода узла с типом MixinDefinition.
 *
 * @param mixinDefinition Блок объявления миксина. node_modules/less/lib/less/tree/mixin-definition.js
 */
VariableReplacerVisitor.prototype.visitMixinDefinition = function (mixinDefinition) {
    this._insideMixinDefinition = true;
};

/**
 * Завершение обхода узла с типом MixinDefinition.
 *
 * @param mixinDefinition Блок объявления миксина. node_modules/less/lib/less/tree/mixin-definition.js
 */
VariableReplacerVisitor.prototype.visitMixinDefinitionOut = function (mixinDefinition) {
    this._insideMixinDefinition = false;
};

/**
 * Начало обхода узла с типом Rule.
 *
 * @param rule Объявление. node_modules/less/lib/less/tree/rule.js
 */
VariableReplacerVisitor.prototype.visitRule = function (rule) {
    if (
        !this._insideRuleset ||
        this._insideMixinDefinition ||
        rule.value instanceof this._less.tree.Anonymous
    ) return;

    var _this = this;

    _this._ruleName = rule.name[0].value;
    var newRuleValue = rule.value;
    var expressionValues = lodash.get(rule.value, 'value[0].value');

    if (!lodash.isArray(expressionValues)) {
        return;
    }

    newRuleValue = new _this._less.tree.Expression(
        expressionValues.map(function(item) {
            return _this._getNewValueByNodeType(item);
        })
    );

    var mapLength = Object.keys(_this._classNamesMap).length;

    if (mapLength === 1) {
        _this._addItemToNewRuleset(
            new this._less.tree.Rule(rule.name, newRuleValue, rule.important, false, 0, rule.currentFileInfo),
            Object.keys(_this._classNamesMap)[0]
        );
    } else if (mapLength > 1 && lodash.isArray(expressionValues)) {
        _this._classNamesMap = makeFullMap(_this._classNamesMap);

        Object.keys(_this._classNamesMap).forEach(function(className) {
            _this._variablesArray = _this._classNamesMap[className];
            var val = new _this._less.tree.Expression(
                expressionValues.map(function(item) {
                    return _this._getNewValueByNodeType(item);
                })
            );

            _this._addItemToNewRuleset(
                new _this._less.tree.Rule(rule.name, val, rule.important, false, 0, rule.currentFileInfo),
                className
            );
        });
    }

    this._variablesArray = null;
    _this._ruleName = null;
    _this._classNamesMap = {};
};

/**
 * Добавление нового узла с типом Ruleset.
 *
 * @param ruleset Ruleset, в который добавляется новый Ruleset.
 * @private
 */
VariableReplacerVisitor.prototype._appendNewRulesets = function (ruleset) {
    var _this = this;
    var placeToInsert = lodash.findIndex(ruleset.rules, function(item) {return item instanceof _this._less.tree.Ruleset});

    Object.keys(_this._newRulesetsByClassName).map(function(className) {
        var newRuleset = new _this._less.tree.Ruleset(_this._getSelectors(className, ruleset.selectors[0].currentFileInfo), _this._newRulesetsByClassName[className]);

        ruleset.rules.splice(placeToInsert || ruleset.rules.length, 0, newRuleset);
    });
};

/**
 * Добавление нового элемента в массив с элементами, которые пойдут в новый Ruleset, на основе определенного css-класса.
 *
 * @param item Новый элемент Ruleset.
 * @param className Название css-класса.
 * @private
 */
VariableReplacerVisitor.prototype._addItemToNewRuleset = function (item, className) {
    if (lodash.isArray(this._newRulesetsByClassName[className])) {
        this._newRulesetsByClassName[className].push(item);
    } else {
        this._newRulesetsByClassName[className] = [item];
    }
};

/**
 * Получить селекторы для нового Ruleset.
 *
 * @param className Название css-класса.
 * @param currentFileInfo Информация по исходному файлу, необходимая для формирования source maps.
 * @private
 */
VariableReplacerVisitor.prototype._getSelectors = function (className, currentFileInfo) {
    var newClassName = className.indexOf('.') === 0 ? className.slice(1) : className;

    return [
        new this._less.tree.Selector([
            new this._less.tree.Element(new this._less.tree.Combinator(' '), '.' + newClassName, 0, currentFileInfo),
            new this._less.tree.Element(new this._less.tree.Combinator(' '), '&', 0, currentFileInfo)
        ])
    ];
};

/**
 * Получить новое значение в зависимости от типа узла.
 *
 * @param node Узел.
 * @private
 */
VariableReplacerVisitor.prototype._getNewValueByNodeType = function (node) {
    var newValue = null;

    switch(node.type) {
        case 'Variable':
            newValue = this._variableValueResolver(node);
            break;
        case 'Operation':
            newValue = this._operationValueResolver(node);
            break;
        case 'Negative':
            newValue = this._negativeValueResolver(node);
            break;
        case 'Call':
            newValue = this._callValueResolver(node);
            break;
        case 'MixinCall':
            newValue = this._mixinCallValueResolver(node);
            break;
        default:
            newValue = node;
    }

    return newValue;
};

/**
 * Получить новое значение для узла типа Variable.
 *
 * @param variable Узел типа Variable. node_modules/less/lib/less/tree/variable.js
 * @private
 */
VariableReplacerVisitor.prototype._variableValueResolver = function (variable) {
    var variableConfig = this._variables[variable.name];

    if (
        !variableConfig ||
        (variableConfig && variableConfig.props.indexOf(this._ruleName) === -1) ||
        this._variablesArray && this._variablesArray.indexOf(variable.name) === -1
    ) {
        return variable;
    } else if (this._variablesArray && this._variablesArray.indexOf(variable.name) > -1) {
        return new this._less.tree.Variable(variableConfig.newVarName, 0, variable.currentFileInfo);
    } else {
        lodash.isArray(this._classNamesMap[variableConfig.className]) ?
            this._classNamesMap[variableConfig.className].push(variable.name) :
            this._classNamesMap[variableConfig.className] = [variable.name];

        return new this._less.tree.Variable(variableConfig.newVarName, 0, variable.currentFileInfo);
    }
};

/**
 * Получить новое значение для узла типа Operation.
 *
 * @param operation Узел типа Operation. node_modules/less/lib/less/tree/operation.js
 * @private
 */
VariableReplacerVisitor.prototype._operationValueResolver = function (operation) {
    var _this = this;

    var operands = operation.operands.map(function(operand) {
        return _this._getNewValueByNodeType(operand);
    });

    return new _this._less.tree.Operation(operation.op, operands);
};

/**
 * Получить новое значение для узла типа Negative.
 *
 * @param negative Узел типа Negative. node_modules/less/lib/less/tree/negative.js
 * @private
 */
VariableReplacerVisitor.prototype._negativeValueResolver = function (negative) {
    return new this._less.tree.Negative(this._getNewValueByNodeType(negative.value));
};

/**
 * Получить новое значение для узла типа Call.
 *
 * @param call Узел типа Call. node_modules/less/lib/less/tree/call.js
 * @private
 */
VariableReplacerVisitor.prototype._callValueResolver = function (call) {
    var _this = this;

    var args = call.args.map(function(arg) {
        return _this._getNewValueByNodeType(arg);
    });

    return new _this._less.tree.Call(call.name, args);
};

/**
 * Получить новое значение для узла типа MixinCall.
 *
 * @param mixinCall Узел типа MixinCall. node_modules/less/lib/less/tree/mixin-call.js
 * @private
 */
VariableReplacerVisitor.prototype._mixinCallValueResolver = function (mixinCall) {
    var _this = this;

    var args = mixinCall.arguments.map(function(item) {
        var exprValue = lodash.get(item, 'value.value');
        if (exprValue) {
            item = {
                ...item,
                value: new _this._less.tree.Expression(
                    exprValue.map(function(item) {
                        return _this._getNewValueByNodeType(item);
                    })
                )
            };
        }

        return item;
    });

    return new _this._less.tree.mixin.Call(mixinCall.selector.elements, args, 0, mixinCall.currentFileInfo);
};

module.exports = VariableReplacerVisitor;
