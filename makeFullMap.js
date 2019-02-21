const map = {
    "a": [1],
    "b": [2],
    "c": [3],
    "d": [4]
};


function makeFullMap (map) {
    let result = {};
    let flat = ["", []];

    Object.keys(map).forEach((key, index, array) => {
        flat[0] += index === 0 ? key : "." + key;
        flat[1] = flat[1].concat(map[key]);
    })

    Object.keys(map).forEach((key, index, array) => {
         for (let i = index + 1; i < array.length; i++) {
            result[[key, array[i]].join('.')] = [].concat(map[key], map[array[i]]);
         }
    });

    return {
        ...map,
        ...result,
        [flat[0]]: flat[1]
    };
}

module.exports = makeFullMap;
