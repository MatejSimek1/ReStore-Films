import { useState, useEffect, useMemo, useContext } from "react";
import "./arhiva.css";
import Layout from "../layout/layout";
import { LayoutContext } from "../layout/layoutcontext";
import { useNavigate } from "react-router-dom";
import pozadina from "../images/filmskaVrpca.jpg";
import jsPDF from "jspdf";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
GlobalWorkerOptions.workerSrc = "/assets/pdf.worker.min.mjs";
import { useMsal } from "@azure/msal-react";

const Arhiva = () => {
  const { scannedBarcodes, setScannedBarcodes } = useContext(LayoutContext);
  const [selectedBarcodes, setSelectedBarcodes] = useState({});
  const [arhivaBarcodes, setArhivaBarcodes] = useState([]);
  const [mergedBarcodes, setMergedBarcodes] = useState([]);

  const navigate = useNavigate();
  const [selectedGroups, setSelectedGroups] = useState({});
  const { instance, accounts } = useMsal();

  const account = accounts[0];
  let userName = account?.name ?? null;
  let userEmail = account?.username ?? null;
  userName = userName
    .replace(/č/g, "C")
    .replace(/ć/g, "C")
    .replace(/Č/g, "C")
    .replace(/Ć/g, "C");
  userEmail = userEmail
    .replace(/č/g, "C")
    .replace(/ć/g, "C")
    .replace(/Č/g, "C")
    .replace(/Ć/g, "C");

  const handleScannerClick = () => {
    navigate("/home");
  };
  const handleClearBarcodes = () => {
    setArhivaBarcodes([]);
  };
  const handleSelectGroup = (groupKey) => {
    const newSelectedGroups = { ...selectedGroups };
    if (newSelectedGroups[groupKey]) {
      delete newSelectedGroups[groupKey];
    } else {
      newSelectedGroups[groupKey] = true;
    }
    setSelectedGroups(newSelectedGroups);
  };

  const handleLoadPDF = () => {
    const pdfFileInput = document.createElement("input");
    pdfFileInput.type = "file";
    pdfFileInput.accept = "application/pdf";

    pdfFileInput.onchange = async (event) => {
      const pdfFile = event.target.files[0];
      if (!pdfFile) {
        console.error("Nema datoteke!");
        return;
      }

      console.log("Odabrana PDF datoteka:", pdfFile.name);
      const pdfReader = new FileReader();

      pdfReader.onload = async (e) => {
        const pdfData = new Uint8Array(e.target.result);

        try {
          console.log("Početak učitavanja PDF-a...");
          const loadingTask = pdfjsLib.getDocument({ data: pdfData });
          const pdfDoc = await loadingTask.promise;

          console.log("PDF učitan. Broj stranica:", pdfDoc.numPages);

          const pages = [];
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const content = await page.getTextContent();
            const text = content.items.map((item) => item.str).join(" ");
            pages.push(text);
            console.log(`Stranica ${i} tekst:`, text);
          }

          const fullText = pages.join("\n");
          console.log("Sadržaj fullText-a:", fullText);

          // Splitaj tekst prema linijama
          const lines = fullText.split("\n");

          // Mapiraj linije i parsiraj sve filmove unutar jedne linije
          const filmovi = [];
          lines.forEach((line, index) => {
            console.log(`Linija ${index + 1}:`, line);

            // Globalni regex za pronalaženje svih filmova u liniji
            const regex =
              /(\d+)\.\s*([A-Za-z0-9\-]+)\s*-\s*(.*?)\s*-\s*(\d{2}:\d{2}:\d{2})/g;
            let match;

            // Pretraži sve filmove u liniji
            while ((match = regex.exec(line)) !== null) {
              console.log("Regex match za film:", match);

              // Dodaj film u listu
              filmovi.push({
                redniBroj: match[1].trim(),
                barcode: match[2].trim(),
                filmTitle: match[3].trim(),
                duration: match[4].trim(),
              });
            }
          });

          console.log("Parsirani filmovi:", filmovi);

          // Generiraj popis filmova sa barcode-ovima i trajanjima
          const arhivaBarcodes = filmovi.map((film) => ({
            filmTitle: film.filmTitle,
            duration: film.duration,
            barcode: film.barcode,
          }));
          setArhivaBarcodes(arhivaBarcodes);
        } catch (err) {
          console.error("Greška tijekom obrade PDF-a:", err);
        }
      };

      pdfReader.readAsArrayBuffer(pdfFile);
    };

    pdfFileInput.click();
  };

  const calculateTotalDuration = () => {
    const totalDuration = arhivaBarcodes.reduce((acc, barcode) => {
      if (typeof barcode === "object" && barcode.duration) {
        const [hours, minutes, seconds] = barcode.duration
          .split(":")
          .map(Number);
        const durationInSeconds = hours * 3600 + minutes * 60 + seconds;
        return acc + durationInSeconds;
      }
      return acc;
    }, 0);

    const hours = Math.floor(totalDuration / 3600);
    const minutes = Math.floor((totalDuration % 3600) / 60);
    const seconds = totalDuration % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };
  const durationToSeconds = (duration) => {
    const [hours, minutes, seconds] = duration.split(":").map(Number);
    return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
  };

  const secondsToDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return [
      hours > 0 ? String(hours).padStart(2, "0") : "00",
      String(minutes).padStart(2, "0"),
      String(remainingSeconds).padStart(2, "0"),
    ].join(":");
  };
  const mergeBarcodes = (barcodes) => {
    const barcodeMap = new Map();

    barcodes.forEach((barcode) => {
      const match = barcode.filmTitle.match(/^(.*?)(?: - \d+\. dio)$/);
      const baseFilmTitle = match ? match[1].trim() : barcode.filmTitle;

      if (barcodeMap.has(barcode.barcode)) {
        const existing = barcodeMap.get(barcode.barcode);

        const newDuration =
          durationToSeconds(existing.duration) +
          durationToSeconds(barcode.duration);

        barcodeMap.set(barcode.barcode, {
          ...existing,
          filmTitle: baseFilmTitle,
          duration: secondsToDuration(newDuration),
        });
      } else {
        barcodeMap.set(barcode.barcode, {
          ...barcode,
          filmTitle: baseFilmTitle,
        });
      }
    });

    return Array.from(barcodeMap.values());
  };
  //
  //
  //
  //
  const groupBarcodesByDuration = (barcodes) => {
    if (barcodes.length === 0) {
      return {};
    }
    const maxDuration = 45 * 60;
    const mergedBarcodes = mergeBarcodes(barcodes);
    const preparedBarcodes = [...mergedBarcodes].sort((a, b) => {
      return durationToSeconds(b.duration) - durationToSeconds(a.duration);
    });

    const groups = [];
    preparedBarcodes.forEach((barcode) => {
      const duration = durationToSeconds(barcode.duration);
      let placed = false;

      for (let j = 0; j < groups.length; j++) {
        const groupDuration = groups[j].reduce(
          (sum, b) => sum + durationToSeconds(b.duration),
          0
        );
        if (groupDuration + duration <= maxDuration) {
          groups[j].push(barcode);
          placed = true;
          break;
        }
      }

      if (!placed) {
        groups.push([barcode]);
      }
    });

    const groupedBarcodes = {};
    groups.forEach((group, index) => {
      const totalDuration = group.reduce(
        (sum, b) => sum + durationToSeconds(b.duration),
        0
      );
      const title = `PDF ${index + 1}: ${secondsToDuration(totalDuration)}`;
      groupedBarcodes[title] = group;
    });

    console.log("Grupe filmova: ", groupedBarcodes);
    return groupedBarcodes;
  };

  const groupedBarcodes = useMemo(() => {
    return groupBarcodesByDuration(mergedBarcodes);
  }, [mergedBarcodes]);

  useEffect(() => {
    const mergedBarcodesResult = mergeBarcodes(arhivaBarcodes);
    setMergedBarcodes(mergedBarcodesResult);
  }, [arhivaBarcodes]);
  console.log(mergedBarcodes);

  const handleStorePDF = () => {
    console.log("Ime i email korisnika:", userName, userEmail);
    setSelectedBarcodes({});
    Object.keys(selectedGroups).forEach((groupKey) => {
      selectedBarcodes[groupKey] = groupedBarcodes[groupKey];
    });
    // Generirajte PDF dokument sa odabranim filmovima
    const pdfDoc = new jsPDF();
    Object.keys(selectedBarcodes).forEach((groupKey, index) => {
      if (index > 0) {
        pdfDoc.addPage();
      }
      const date = new Date();
      const dateString =
        date.toLocaleDateString() + " " + date.toLocaleTimeString();
      pdfDoc.text(`${userName} (${userEmail})`, 10, 10, null, null, "left");
      pdfDoc.text(dateString, 180, 10, null, null, "right");
      pdfDoc.text(
        "Popis filmova vracenih u arhivu:",
        10,
        20,
        null,
        null,
        "left"
      );
      const groupDuration = selectedBarcodes[groupKey].reduce(
        (acc, barcode) => {
          const durationInSeconds = durationToSeconds(barcode.duration);
          return acc + durationInSeconds;
        },
        0
      );
      const groupDurationText = secondsToDuration(groupDuration);
      pdfDoc.text(
        `Grupa ${index + 1} (Ukupno trajanje: ${groupDurationText})`,
        10,
        30
      );
      selectedBarcodes[groupKey].forEach((barcode, barcodeIndex) => {
        const text = `${barcodeIndex + 1}. ${
          barcode.barcode
        } - ${barcode.filmTitle.replace(/č/g, "c").replace(/ć/g, "c")} - ${
          barcode.duration
        }`;
        pdfDoc.text(text, 10, 40 + barcodeIndex * 10, null, null, "left", true);
      });
      pdfDoc.text(`Potpis: ___________`, 180, 280, null, null, "right");
    });
    const pdfBlob = new Blob([pdfDoc.output("blob")], {
      type: "application/pdf",
    });
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = "arhiva.pdf";
    link.click();
    URL.revokeObjectURL(pdfUrl);

    const selectedBarcodesArray = Object.values(selectedBarcodes);
    const newScannedBarcodes = mergedBarcodes.filter((barcode) => {
      return !selectedBarcodesArray.some((group) => {
        return group.some((selectedBarcode) => {
          return selectedBarcode.barcode === barcode.barcode;
        });
      });
    });
    setMergedBarcodes(newScannedBarcodes);
    setArhivaBarcodes(newScannedBarcodes);
    setSelectedBarcodes({});
    setSelectedGroups({});
  };

  return (
    <Layout>
      <div className="barcode-main">
        <img
          className="barcode-bg-image"
          src={pozadina}
          alt="background picture"
        ></img>
        <div className="barcode-list-container">
          <div className="barcode-scanned">
            <div className="left-title">Arhiva barcodes</div>
            <div className="left-list">
              <ul>
                {mergedBarcodes.map((barcode, index) => (
                  <li key={index}>
                    <span style={{ fontSize: "16px" }}>
                      {index + 1}.{" "}
                      {typeof barcode === "object"
                        ? `${barcode.barcode} - ${barcode.filmTitle} - ${barcode.duration}`
                        : barcode}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="total-duration">
              Total duration: {calculateTotalDuration()}
            </p>
            <div className="barcode-btns">
              <button onClick={handleClearBarcodes}>Clear</button>
              <button onClick={handleScannerClick}>Home</button>
              <button onClick={handleLoadPDF}>Load PDF</button>
              <button onClick={handleStorePDF}>Archive</button>
            </div>
          </div>

          <div className="barcode-grouped">
            <div className="right-title">PDF barcodes</div>
            <div className="grouped-list">
              {Object.keys(groupedBarcodes).map((groupKey) => (
                <div className="wrap-group">
                  <p className="group-key">{groupKey}</p>
                  <input
                    type="checkbox"
                    checked={selectedGroups[groupKey]}
                    onChange={() => handleSelectGroup(groupKey)}
                    style={{
                      fontSize: "16px",
                      padding: "0 5px",
                      border: "none",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                    }}
                  />
                  <div>
                    <ul>
                      {groupedBarcodes[groupKey].map((barcode, index) => (
                        <li key={index}>
                          <span style={{ fontSize: "16px" }}>
                            {index + 1}.{" "}
                            {typeof barcode === "object"
                              ? `${barcode.barcode} - ${barcode.filmTitle} - ${barcode.duration}`
                              : barcode}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Arhiva;
