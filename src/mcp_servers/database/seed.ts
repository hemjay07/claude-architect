import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "src/mcp_servers/database/clinical_trials.db");
const db = new Database(DB_PATH);

// Create tables
db.exec(`
CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trial_name TEXT NOT NULL,
    drug TEXT NOT NULL,
    drug_class TEXT NOT NULL,
    comparator TEXT NOT NULL,
    indication TEXT NOT NULL,
    population TEXT NOT NULL,
    n_total INTEGER NOT NULL,
    duration_years REAL NOT NULL,
    primary_endpoint TEXT NOT NULL,
    primary_result TEXT NOT NULL,
    primary_p_value TEXT NOT NULL,
    superiority INTEGER NOT NULL,
    hba1c_reduction REAL,
    weight_reduction_kg REAL,
    cv_death_rr REAL,
    hf_hospitalisation_rr REAL,
    renal_outcome_rr REAL,
    pancreatitis_events INTEGER,
    publication_year INTEGER NOT NULL,
    journal TEXT NOT NULL,
    doi TEXT
);

CREATE TABLE IF NOT EXISTS safety_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trial_id INTEGER NOT NULL REFERENCES trials(id),
    event_type TEXT NOT NULL,
    drug_arm_pct REAL NOT NULL,
    placebo_arm_pct REAL NOT NULL,
    relative_risk REAL,
    severity TEXT NOT NULL,
    notes TEXT
);
`);

// Seed trials
const insertTrial = db.prepare(`
INSERT INTO trials (
    trial_name, drug, drug_class, comparator, indication, population,
    n_total, duration_years, primary_endpoint, primary_result, primary_p_value,
    superiority, hba1c_reduction, weight_reduction_kg, cv_death_rr,
    publication_year, journal, doi
) VALUES (
    @trial_name, @drug, @drug_class, @comparator, @indication, @population,
    @n_total, @duration_years, @primary_endpoint, @primary_result, @primary_p_value,
    @superiority, @hba1c_reduction, @weight_reduction_kg, @cv_death_rr,
    @publication_year, @journal, @doi
)
`);

const trials = [
    {
        trial_name: "SUSTAIN-6", drug: "semaglutide", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "T2DM + CV risk",
        population: "T2DM, age >= 50, established CV disease or CKD",
        n_total: 3297, duration_years: 2.1,
        primary_endpoint: "3-point MACE",
        primary_result: "HR 0.74 (95% CI 0.58-0.95)",
        primary_p_value: "p=0.02", superiority: 1,
        hba1c_reduction: 1.1, weight_reduction_kg: 4.53, cv_death_rr: 0.98,
        publication_year: 2016, journal: "NEJM",
        doi: "10.1056/NEJMoa1607141"
    },
    {
        trial_name: "SELECT", drug: "semaglutide", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "CV risk without T2DM",
        population: "BMI >= 27, established CVD, no T2DM",
        n_total: 17604, duration_years: 3.3,
        primary_endpoint: "3-point MACE",
        primary_result: "HR 0.80 (95% CI 0.72-0.90)",
        primary_p_value: "p<0.001", superiority: 1,
        hba1c_reduction: null, weight_reduction_kg: 9.39, cv_death_rr: 0.85,
        publication_year: 2023, journal: "NEJM",
        doi: "10.1056/NEJMoa2307563"
    },
    {
        trial_name: "LEADER", drug: "liraglutide", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "T2DM + CV risk",
        population: "T2DM, age >= 50, established CV disease or risk factors",
        n_total: 9340, duration_years: 3.8,
        primary_endpoint: "3-point MACE",
        primary_result: "HR 0.87 (95% CI 0.78-0.97)",
        primary_p_value: "p=0.01", superiority: 1,
        hba1c_reduction: 0.4, weight_reduction_kg: 2.3, cv_death_rr: 0.78,
        publication_year: 2016, journal: "NEJM",
        doi: "10.1056/NEJMoa1603827"
    },
    {
        trial_name: "PIONEER-6", drug: "semaglutide oral", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "T2DM + CV risk",
        population: "T2DM, age >= 50, established CV disease or CKD",
        n_total: 3183, duration_years: 1.3,
        primary_endpoint: "3-point MACE",
        primary_result: "HR 0.79 (95% CI 0.57-1.11)",
        primary_p_value: "p<0.001", superiority: 0,
        hba1c_reduction: 1.0, weight_reduction_kg: 1.2, cv_death_rr: 0.51,
        publication_year: 2019, journal: "NEJM",
        doi: "10.1056/NEJMoa1901118"
    },
    {
        trial_name: "SURPASS-CVOT", drug: "tirzepatide", drug_class: "GIP/GLP-1 RA",
        comparator: "semaglutide", indication: "T2DM + CV risk",
        population: "T2DM, established CV disease",
        n_total: 13000, duration_years: 3.4,
        primary_endpoint: "3-point MACE",
        primary_result: "HR 0.85 (95% CI 0.71-1.02)",
        primary_p_value: "p<0.001", superiority: 0,
        hba1c_reduction: 1.24, weight_reduction_kg: 7.8, cv_death_rr: null,
        publication_year: 2024, journal: "NEJM",
        doi: "10.1056/NEJMoa2406526"
    },
    {
        trial_name: "STEP-1", drug: "semaglutide", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "Obesity",
        population: "BMI >= 30 or >= 27 with comorbidity, no T2DM",
        n_total: 1961, duration_years: 1.1,
        primary_endpoint: "Body weight % change",
        primary_result: "-14.9% vs -2.4%",
        primary_p_value: "p<0.001", superiority: 1,
        hba1c_reduction: null, weight_reduction_kg: 15.3, cv_death_rr: null,
        publication_year: 2021, journal: "NEJM",
        doi: "10.1056/NEJMoa2032183"
    },
    {
        trial_name: "STEP-HFpEF", drug: "semaglutide", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "HFpEF + Obesity",
        population: "HFpEF, BMI >= 30, no T2DM",
        n_total: 529, duration_years: 1.0,
        primary_endpoint: "KCCQ-CSS + weight change",
        primary_result: "KCCQ +7.8 pts, weight -13.3%",
        primary_p_value: "p<0.001", superiority: 1,
        hba1c_reduction: null, weight_reduction_kg: 13.3, cv_death_rr: null,
        publication_year: 2023, journal: "NEJM",
        doi: "10.1056/NEJMoa2309424"
    },
    {
        trial_name: "FLOW", drug: "semaglutide", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "T2DM + CKD",
        population: "T2DM, eGFR 25-75, UACR >= 300",
        n_total: 3533, duration_years: 3.4,
        primary_endpoint: "Renal composite",
        primary_result: "HR 0.76 (95% CI 0.66-0.88)",
        primary_p_value: "p<0.001", superiority: 1,
        hba1c_reduction: 0.9, weight_reduction_kg: 3.8, renal_outcome_rr: 0.76,
        cv_death_rr: null,
        publication_year: 2024, journal: "NEJM",
        doi: "10.1056/NEJMoa2403347"
    },
    {
        trial_name: "EMPA-KIDNEY", drug: "empagliflozin", drug_class: "SGLT2i",
        comparator: "placebo", indication: "CKD",
        population: "CKD, eGFR 20-45 or eGFR 45-90 with UACR >= 200",
        n_total: 6609, duration_years: 2.0,
        primary_endpoint: "Renal/CV death composite",
        primary_result: "HR 0.72 (95% CI 0.64-0.82)",
        primary_p_value: "p<0.001", superiority: 1,
        hba1c_reduction: null, weight_reduction_kg: null, cv_death_rr: null,
        renal_outcome_rr: 0.72,
        publication_year: 2022, journal: "NEJM",
        doi: "10.1056/NEJMoa2204233"
    },
    {
        trial_name: "SURMOUNT-1", drug: "tirzepatide", drug_class: "GIP/GLP-1 RA",
        comparator: "placebo", indication: "Obesity",
        population: "BMI >= 30 or >= 27 with comorbidity, no T2DM",
        n_total: 2539, duration_years: 1.25,
        primary_endpoint: "Body weight % change",
        primary_result: "-20.9% (15mg) vs -3.1%",
        primary_p_value: "p<0.001", superiority: 1,
        hba1c_reduction: null, weight_reduction_kg: 20.9, cv_death_rr: null,
        publication_year: 2022, journal: "NEJM",
        doi: "10.1056/NEJMoa2206038"
    },
    {
        trial_name: "AWARD-11", drug: "dulaglutide", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "T2DM",
        population: "T2DM inadequately controlled on metformin",
        n_total: 1842, duration_years: 0.9,
        primary_endpoint: "HbA1c reduction",
        primary_result: "-1.77% (4.5mg) vs -0.61%",
        primary_p_value: "p<0.001", superiority: 1,
        hba1c_reduction: 1.77, weight_reduction_kg: 4.6, cv_death_rr: null,
        publication_year: 2021, journal: "Lancet",
        doi: "10.1016/S0140-6736(21)00154-3"
    },
    {
        trial_name: "ELIXA", drug: "lixisenatide", drug_class: "GLP-1 RA",
        comparator: "placebo", indication: "T2DM + recent ACS",
        population: "T2DM, recent acute coronary syndrome",
        n_total: 6068, duration_years: 2.1,
        primary_endpoint: "4-point MACE",
        primary_result: "HR 1.02 (95% CI 0.89-1.17)",
        primary_p_value: "p<0.001", superiority: 0,
        hba1c_reduction: 0.27, weight_reduction_kg: 0.7, cv_death_rr: null,
        publication_year: 2015, journal: "NEJM",
        doi: "10.1056/NEJMoa1509225"
    },
];

// Run in a transaction for atomicity
const insertMany = db.transaction((trials: any[]) => {
    for (const trial of trials) {
        insertTrial.run(trial);
    }
});

insertMany(trials);

console.log(`Seeded ${trials.length} trials successfully`);
db.close();