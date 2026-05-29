const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MONTHS = [
  ["M01", "Jan", "January"],
  ["M02", "Feb", "February"],
  ["M03", "Mar", "March"],
  ["M04", "Apr", "April"],
  ["M05", "May", "May"],
  ["M06", "Jun", "June"],
  ["M07", "Jul", "July"],
  ["M08", "Aug", "August"],
  ["M09", "Sep", "September"],
  ["M10", "Oct", "October"],
  ["M11", "Nov", "November"],
  ["M12", "Dec", "December"]
];

const STATE_META = {
  "01": ["AL", "Alabama"], "02": ["AK", "Alaska"], "04": ["AZ", "Arizona"], "05": ["AR", "Arkansas"],
  "06": ["CA", "California"], "08": ["CO", "Colorado"], "09": ["CT", "Connecticut"], "10": ["DE", "Delaware"],
  "11": ["DC", "District of Columbia"], "12": ["FL", "Florida"], "13": ["GA", "Georgia"], "15": ["HI", "Hawaii"],
  "16": ["ID", "Idaho"], "17": ["IL", "Illinois"], "18": ["IN", "Indiana"], "19": ["IA", "Iowa"],
  "20": ["KS", "Kansas"], "21": ["KY", "Kentucky"], "22": ["LA", "Louisiana"], "23": ["ME", "Maine"],
  "24": ["MD", "Maryland"], "25": ["MA", "Massachusetts"], "26": ["MI", "Michigan"], "27": ["MN", "Minnesota"],
  "28": ["MS", "Mississippi"], "29": ["MO", "Missouri"], "30": ["MT", "Montana"], "31": ["NE", "Nebraska"],
  "32": ["NV", "Nevada"], "33": ["NH", "New Hampshire"], "34": ["NJ", "New Jersey"], "35": ["NM", "New Mexico"],
  "36": ["NY", "New York"], "37": ["NC", "North Carolina"], "38": ["ND", "North Dakota"], "39": ["OH", "Ohio"],
  "40": ["OK", "Oklahoma"], "41": ["OR", "Oregon"], "42": ["PA", "Pennsylvania"], "44": ["RI", "Rhode Island"],
  "45": ["SC", "South Carolina"], "46": ["SD", "South Dakota"], "47": ["TN", "Tennessee"], "48": ["TX", "Texas"],
  "49": ["UT", "Utah"], "50": ["VT", "Vermont"], "51": ["VA", "Virginia"], "53": ["WA", "Washington"],
  "54": ["WV", "West Virginia"], "55": ["WI", "Wisconsin"], "56": ["WY", "Wyoming"]
};

const TILE_COORDS = {
  AK: [0, 0], ME: [11, 0], VT: [10, 1], NH: [11, 1], WA: [1, 2], MT: [2, 2], ND: [3, 2],
  MN: [4, 2], WI: [5, 2], MI: [6, 2], NY: [8, 2], MA: [10, 2], RI: [11, 2], OR: [1, 3],
  ID: [2, 3], SD: [3, 3], IA: [4, 3], IL: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3],
  NJ: [9, 3], CT: [10, 3], CA: [1, 4], NV: [2, 4], WY: [3, 4], NE: [4, 4], MO: [5, 4],
  KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4], AZ: [2, 5], UT: [3, 5],
  CO: [4, 5], KS: [5, 5], AR: [6, 5], TN: [7, 5], NC: [8, 5], SC: [9, 5], DC: [10, 5],
  NM: [3, 6], OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6], HI: [0, 7],
  TX: [4, 7], FL: [9, 7]
};

const MLS_INDUSTRIES = [
  ["Manufacturing", "0007"],
  ["Construction", "0006"],
  ["Retail trade", "0030"],
  ["Transportation", "0031"],
  ["Information", "0032"],
  ["Government", "0044"]
];

const JOLTS_INDUSTRIES = [
  ["Manufacturing", "300000"],
  ["Construction", "230000"],
  ["Retail trade", "440000"],
  ["Transportation/Warehousing/Utilities", "480099"],
  ["Information", "510000"],
  ["Government", "900000"]
];

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const request = require("https").request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => raw += chunk);
      response.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(new Error(`Could not parse response from ${url}: ${raw.slice(0, 200)}`));
        }
      });
    });
    request.on("error", reject);
    request.write(data);
    request.end();
  });
}

function getText(url) {
  return new Promise((resolve, reject) => {
    require("https").get(url, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => raw += chunk);
      response.on("end", () => resolve(raw));
    }).on("error", reject);
  });
}

async function fetchBls(seriesIds, startyear, endyear) {
  const json = await postJson("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    seriesid: seriesIds,
    startyear: String(startyear),
    endyear: String(endyear)
  });
  if (json.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`BLS API request failed: ${JSON.stringify(json.message || json)}`);
  }
  return json.Results.series;
}

function mergeSeries(target, incoming) {
  for (const series of incoming) {
    if (!target.has(series.seriesID)) target.set(series.seriesID, { seriesID: series.seriesID, data: [] });
    target.get(series.seriesID).data.push(...(series.data || []));
  }
}

function valuesByYear(series, year, multiplier = 1) {
  if (!series) return [];
  const byPeriod = Object.fromEntries(
    series.data
      .filter((row) => row.year === String(year) && row.period.startsWith("M"))
      .map((row) => [row.period, Number(row.value) * multiplier])
  );
  return MONTHS.map(([key]) => byPeriod[key] ?? null).filter((value) => value !== null);
}

function monthRows(year, claimants, events = []) {
  return claimants.map((value, index) => ({
    key: MONTHS[index][0],
    label: MONTHS[index][1],
    name: MONTHS[index][2],
    claimants: Math.round(value),
    events: events[index] == null ? null : Math.round(events[index])
  }));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function parseCsvLine(line) {
  return line.match(/(?:"[^"]*"|[^,])+/g).map((value) => value.replace(/^"|"$/g, ""));
}

async function buildSp500() {
  const githubCsv = await getText("https://raw.githubusercontent.com/vijinho/sp500/master/csv/sp500.csv");
  const fredCsv = await getText("https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500");
  const byMonth = new Map();

  for (const line of githubCsv.trim().split(/\r?\n/).slice(1)) {
    const parts = parseCsvLine(line);
    const date = parts[1].slice(0, 10);
    const close = Number(parts[5]);
    if (/^(199[6-9]|20[0-1][0-9])/.test(date) && Number.isFinite(close)) {
      byMonth.set(date.slice(0, 7), { date, close });
    }
  }

  for (const line of fredCsv.trim().split(/\r?\n/).slice(1)) {
    const [date, rawClose] = line.split(",");
    const close = Number(rawClose);
    if (/^20(1[6-9]|2[0-9])/.test(date) && Number.isFinite(close)) {
      byMonth.set(date.slice(0, 7), { date, close });
    }
  }

  return byMonth;
}

function sp500ForYear(sp500ByMonth, year, monthCount) {
  return MONTHS.slice(0, monthCount).map((_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    return sp500ByMonth.get(key) || { date: key, close: null };
  });
}

async function main() {
  const currentYear = new Date().getFullYear();
  const all = new Map();
  const stateClaimantIds = Object.keys(STATE_META).map((code) => `MLUMS${code}NN0001005`);
  const mlsNationalIds = ["MLUMS00NN0001003", "MLUMS00NN0001005"];
  const mlsIndustryIds = MLS_INDUSTRIES.flatMap(([, code]) => [`MLUMS00NN${code}005`]);
  const joltsIds = [
    "JTS000000000000000LDL",
    ...JOLTS_INDUSTRIES.map(([, code]) => `JTS${code}000000000LDL`)
  ];
  const contextIds = ["LNS14000000", "LNS13000000", "CES0000000001"];

  for (const [start, end] of [[1996, 2005], [2006, 2013]]) {
    mergeSeries(all, await fetchBls([...mlsNationalIds, ...mlsIndustryIds], start, end));
    for (let i = 0; i < stateClaimantIds.length; i += 25) {
      mergeSeries(all, await fetchBls(stateClaimantIds.slice(i, i + 25), start, end));
    }
  }

  const joltsRanges = [];
  for (let start = 2014; start <= currentYear; start += 10) {
    joltsRanges.push([start, Math.min(start + 9, currentYear)]);
  }
  for (const [start, end] of joltsRanges) {
    mergeSeries(all, await fetchBls(joltsIds, start, end));
  }

  const contextRanges = [];
  for (let start = 1996; start <= currentYear; start += 10) {
    contextRanges.push([start, Math.min(start + 9, currentYear)]);
  }
  for (const [start, end] of contextRanges) {
    mergeSeries(all, await fetchBls(contextIds, start, end));
  }

  const sp500ByMonth = await buildSp500();
  const years = {};

  for (let year = 1996; year <= 2013; year += 1) {
    const claimants = valuesByYear(all.get("MLUMS00NN0001005"), year);
    if (!claimants.length) continue;
    const events = valuesByYear(all.get("MLUMS00NN0001003"), year);
    years[year] = {
      source: "MLS",
      metricLabel: "Initial claimants",
      eventsLabel: "Mass layoff events",
      months: monthRows(year, claimants, events),
      industries: MLS_INDUSTRIES.map(([label, code]) => ({
        label,
        claimants: valuesByYear(all.get(`MLUMS00NN${code}005`), year).map(Math.round)
      })),
      states: stateClaimantIds.map((id) => {
        const code = id.slice(5, 7);
        const [abbr, name] = STATE_META[code];
        const [x, y] = TILE_COORDS[abbr];
        return { abbr, name, x, y, claimants: valuesByYear(all.get(id), year).map(Math.round) };
      }).filter((row) => row.claimants.length),
      context: {}
    };
  }

  for (let year = 2014; year <= currentYear; year += 1) {
    const layoffs = valuesByYear(all.get("JTS000000000000000LDL"), year, 1000);
    if (!layoffs.length) continue;
    years[year] = {
      source: "JOLTS",
      metricLabel: "Layoffs/discharges",
      eventsLabel: "Events not available",
      months: monthRows(year, layoffs, []),
      industries: JOLTS_INDUSTRIES.map(([label, code]) => ({
        label,
        claimants: valuesByYear(all.get(`JTS${code}000000000LDL`), year, 1000).map(Math.round)
      })),
      states: [],
      context: {}
    };
  }

  for (const [year, data] of Object.entries(years)) {
    const monthCount = data.months.length;
    data.context.unemploymentRate = valuesByYear(all.get("LNS14000000"), year).slice(0, monthCount);
    data.context.unemployedPersons = valuesByYear(all.get("LNS13000000"), year).slice(0, monthCount);
    data.context.nonfarmPayrolls = valuesByYear(all.get("CES0000000001"), year).slice(0, monthCount);
    data.context.sp500MonthEnd = sp500ForYear(sp500ByMonth, year, monthCount);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    notes: [
      "MLS covers establishments with at least 50 UI initial claims in a 5-week period and ends in 2013.",
      "JOLTS layoffs/discharges begin in this dashboard in 2014 and are not directly equivalent to MLS mass layoff events.",
      "JOLTS values are published in thousands by BLS and converted to persons here."
    ],
    yearly: Object.entries(years).map(([year, data]) => ({
      year: Number(year),
      source: data.source,
      metricLabel: data.metricLabel,
      total: Math.round(sum(data.months.map((month) => month.claimants))),
      events: data.months.some((month) => month.events != null)
        ? Math.round(sum(data.months.map((month) => month.events || 0)))
        : null,
      monthCount: data.months.length
    })),
    years
  };

  fs.writeFileSync(path.join(ROOT, "data.js"), `window.DASHBOARD_DATA = ${JSON.stringify(output, null, 2)};\n`);
  console.log(`Wrote ${Object.keys(years).length} years to data.js`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
