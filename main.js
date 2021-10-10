require("dotenv").config();
const puppeteer = require('puppeteer');
const cheerio = require("cheerio").default;
const fs = require("fs");
const urlUjian = "http://test12.smkn2-singosari.sch.id/test/u1/";
const express = require("express");
const app = express();

app.use(express.urlencoded({ extended: false }))
app.use(express.json());

app.post("/", async (req, res) => {
    const { tokenNya, idNya, nis, pw } = req.body;
    if (!tokenNya || !idNya || !nis || !pw) {
        return res.status(400).json({ msg: "data body required" });
    }
    console.log(req.body);
    {
        const browser = await puppeteer.launch({ headless: false });
        // const page = await browser.pages();
        const currentPage = await browser.newPage();

        await currentPage.goto(urlUjian, {
            waitUntil: ['domcontentloaded', 'networkidle2'],
        });

        await currentPage.waitForSelector('input[placeholder="NIS Siswa"], input[placeholder="Password"]', { visible: true });

        await currentPage.type('input[placeholder="NIS Siswa"]', nis);
        await currentPage.type('input[placeholder="Password"]', pw);
        await currentPage.click("#submit");


        // MASUKKAN NOMOR SOAL DAN TOKEN YANG INGIN DI SCRAPE
        scrape(currentPage, idNya, tokenNya)
            .then(getUser => {
                console.log(fs.existsSync("./secret-hasil.txt"));
                if (fs.existsSync("./secret-hasil.txt")) {
                    let hasilPengerjaan = fs.readFileSync("./secret-hasil.txt", { encoding: "utf-8" });
                    hasilPengerjaan = hasilPengerjaan.split("ShowPengerjaan")[1];
                    hasilPengerjaan = hasilPengerjaan.replace(/;/g, "").trim();
                    hasilPengerjaan = hasilPengerjaan.replace(/"/g, "").trim();
                    hasilPengerjaan = hasilPengerjaan.replace("(", "").trim();
                    hasilPengerjaan = hasilPengerjaan.replace(")", "").trim();
                    let hasilUjian = hasilPengerjaan.split(",");
                    let hasilPush = []
                    hasilUjian.forEach((data, i) => {
                        if (data != 0 && data != "" && data) {
                            hasilPush.push(data.trim());
                        }
                    });
                    let hasilRender = {
                        nama: getUser[1], kelas: getUser[getUser.length - 1],
                        data: hasilPush[0], mapel: hasilPush[1],
                        guru: hasilPush[2], waktu: hasilPush[hasilPush.length - 1],
                        nilai: hasilPush[hasilPush.length - 2],
                        salah: hasilPush[hasilPush.length - 3],
                        benar: hasilPush[hasilPush.length - 4],
                        jmlh: hasilPush[hasilPush.length - 5]
                    }
                    console.log(hasilRender);
                    res.json(hasilRender);
                }
            })
            .finally(() => browser.close());
    }
})

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
})

let port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log("Running on port " + port)
});

const scrape = (page, nomrSoal, token) => (new Promise(async (resolve, reject) => {
    for (let i = 1; i < 4; i++) {
        fs.existsSync(`./secret-${i}.txt`) && fs.unlinkSync(`./secret-${i}.txt`);
    }
    fs.existsSync(`./secret-hasil.txt`) && fs.unlinkSync(`./secret-hasil.txt`);

    await page.goto(`${urlUjian}home.php?page=validasi&ns=${nomrSoal}`, {
        waitUntil: ['domcontentloaded', 'networkidle2']
    });

    await page.waitForSelector('#ps', { visible: true });
    await page.type('#ps', token);

    let stats = false;
    let i = 1;
    page.waitForResponse(async response => {
        let url = await response.url();
        if (url.endsWith("sc.core.php")) {
            try {
                let stringData = await response.text();
                if (stringData) {
                    stringData = stringData.replace(/\s+/g, ' ').trim();
                    if (stringData.startsWith(`$("#top")`)) {
                        fs.writeFileSync(`./secret-hasil.txt`, stringData, { encoding: 'utf-8' });
                        resolve(userData);
                        stats = false;
                        return;
                    } else {
                        fs.writeFileSync(`./secret-${i}.txt`, stringData, { encoding: 'utf-8' });
                        stats = true;
                        return;
                    }
                    i++;
                }
            } catch (error) { }
        }
    });

    await page.click("input[name='cek']");
    await page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle2'] });

    const content = await page.content();
    let $ = cheerio.load(content);

    let userData = [];
    let bottom = $("#bottom").find("div").last().find("label");
    bottom.each(function () {
        userData.push($(this).text());
    });

    let allSoal = $("#wrapSoal").find(".owl-wrapper .owl-item");
    let soalTemp = [];
    allSoal.each(function () {
        let idSoal = $(this).find(".item").attr("id");
        let title = $(this).find(".wrapSoalDetail_No").text().replace(/\s+/g, ' ').trim();
        let soal = $(this).find(".wrapSoalDetail_Soal").text().replace(/\s+/g, ' ').trim();
        let pilihan = [];
        let allPilihan = $(this).find(".pilihan .row");
        allPilihan.each(function () {
            let abjad = $(this).find(".choice label").text().replace(/\s+/g, ' ').trim();
            let kataPilihan = $(this).find(".ket-choice").text().replace(/\s+/g, ' ').trim();
            pilihan.push(`${abjad}: ${kataPilihan}`);
        });

        soalTemp.push({ idSoal, title, soal, pilihan });
    });

    fs.writeFileSync(`./soal-${nomrSoal}.json`, JSON.stringify(soalTemp), { encoding: 'utf-8' });

    if (stats == true) resolve(userData);
}))