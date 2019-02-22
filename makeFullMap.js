/*
До:
{
    'a': [1],
    'b': [2],
    'c': [3]
}

После:
{
    'a': [1],
    'b': [2],
    'c': [3],
    'a.b': [1, 2],
    'a.c': [1, 3],
    'b.c': [2, 3],
    'a.b.c': [1, 2, 3]
}
 */
/**
 * Построение полной карты названий css-классов - списка переменных для замены для конкретного класса.
 */
module.exports = function makeFullMap (map) {
    let combinations = {};
    let allInOne = ["", []];

    Object.keys(map).forEach((key, index, array) => {
        allInOne[0] += index === 0 ? key : "." + key;
        allInOne[1] = allInOne[1].concat(map[key]);

        for (let i = index + 1; i < array.length; i++) {
            combinations[[key, array[i]].join('.')] = [].concat(map[key], map[array[i]]);
        }
    });

    return {
        ...map,
        ...combinations,
        [allInOne[0]]: allInOne[1]
    };
};
