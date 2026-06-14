const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const datasetPath = path.join(__dirname, 'datasets', 'ports', 'UpdatedPub150.csv');

if (!fs.existsSync(datasetPath)) {
    console.log("File does not exist:", datasetPath);
    process.exit(1);
}

const csv = fs.readFileSync(datasetPath, 'utf8');
const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
});

const sizes = Array.from(new Set(records.map(r => r['Harbor Size'] || '')));
console.log("Harbor Sizes:", sizes);

const indiaPorts = records.filter(r => {
    const cc = (r['Country Code'] || '').toLowerCase();
    return cc === 'india';
});

console.log("\nIndia Ports sample (first 10):");
for (let i = 0; i < Math.min(10, indiaPorts.length); i++) {
    console.log({
        name: indiaPorts[i]['Main Port Name'],
        size: indiaPorts[i]['Harbor Size'],
        type: indiaPorts[i]['Harbor Type'],
        unlocode: indiaPorts[i]['UN/LOCODE']
    });
}
