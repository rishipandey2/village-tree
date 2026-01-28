const fs = require('fs');

// Read the data.js file
const fileContent = fs.readFileSync('data.js', 'utf8');

// Quick and dirty eval to get the object (since it's just a const assignment)
// Remove "const familyData =" and execute
const jsonStr = fileContent.replace('const familyData =', '').trim().replace(/;$/, '');
// We'll wrap it in a function to return it or just eval
let familyData;
try {
    eval('familyData = ' + jsonStr);
} catch (e) {
    console.error("Eval failed:", e);
    process.exit(1);
}

const flatList = [];

function traverse(node, parentId) {
    flatList.push({
        id: node.id,
        name: node.name,
        nameEn: node.nameEn,
        birthYear: node.birthYear,
        generation: node.generation,
        parentId: parentId || null
    });

    if (node.children) {
        node.children.forEach(child => traverse(child, node.id));
    }
}

traverse(familyData, null);

// Sort by ID for neatness
flatList.sort((a, b) => a.id - b.id);

console.log("const familyMembers = " + JSON.stringify(flatList, null, 2) + ";");
