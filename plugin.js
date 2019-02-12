const lodash = require('lodash');

module.exports = {
    install: function(
            {
                visitors: {Visitor}, 
                tree: {
                    Combinator,
                    Selector,
                    Element,
                    Variable,
                    Value,
                    Expression,
                    Declaration,
                    Ruleset,
                    Node,
                    Operation
                }
            },
            pluginManager
        ) {
        const s3Selectors = [
            new Selector([
                new Element(new Combinator(' '), ".s3"),
                new Element(new Combinator(' '), "&")
            ])
        ];

        pluginManager.addVisitor({
            isPreEvalVisitor: true,
            run: function (root) {
                (new Visitor(this)).visit(root);
            },
            visitRuleset: function (ruleNode) {
                this._inRule = !ruleNode.root;
            },
            visitRulesetOut: function (ruleNode, visitArgs) {
                this._inRule = false;
            },
            visitDeclaration: function (declaration, args) {
                const head = lodash.isArray(declaration.name) && lodash.head(declaration.name);
                if (!this._inRule || (head && head.value !== "width")) return declaration;

                let value = declaration.value;
                const valueValue = lodash.get(value, 'value[0].value[0]');

                if (valueValue instanceof Variable) {
                    value = new Value(new Expression([new Variable(valueValue.name + "-s3", Node.prototype.getIndex(), Node.prototype.fileInfo())]));
                } else if (valueValue instanceof Operation) {
                    const operands = valueValue.operands.map(item => {
                        if (item instanceof Variable) {
                            return new Variable(item.name + "-s3", Node.prototype.getIndex(), Node.prototype.fileInfo())
                        }

                        return item;
                    });
                    value = new Value(new Expression([
                        new Operation(valueValue.op, operands)
                    ]));
                }

                const rules = [
                    new Declaration(declaration.name, value)
                ];

                let ruleset = new Ruleset(s3Selectors, rules);

                declaration.parent.rules.push(ruleset);
            }
        });
    }
}
