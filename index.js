import { createReadStream } from "fs";
import { parse } from "csv-parse";
import { validate } from "email-validator";
import phonelib from "google-libphonenumber";
import pkg from "lodash";
import fs from "fs";

const COUNTRY_CODE = "BR";
const EMAIL_REGEX_VALIDATION =
  /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
const VALUE_REGEX_SEPARATOR = /[\/",]/g;
const CSV_PK = "eid";
const CSV_FILE_NAME = "input.csv";
const JSON_FILE_NAME = "output.json";

const { dropWhile } = pkg;
var csvData = [];

const buildAndValidatePhone = (phoneNumber) => {
  let strIntlNumber = false;

  try {
    const phoneUtil = phonelib.PhoneNumberUtil.getInstance();
    const number = phoneUtil.parseAndKeepRawInput(phoneNumber, COUNTRY_CODE);
    if (phoneUtil.isValidNumber(number)) {
      const PNT = phonelib.PhoneNumberType;
      const numberType = phoneUtil.getNumberType(number);

      if (numberType == PNT.MOBILE) {
        const PNF = phonelib.PhoneNumberFormat;
        strIntlNumber = phoneUtil.format(number, PNF.E164);
        strIntlNumber = strIntlNumber.replace("+", "");
      }
    }
  } catch (err) {
    // TODO: Usually I add a call to some tracking tool, to understand and locate cases with invalid numbers, in this case I just ignore
  }

  return strIntlNumber;
};

const formatValue = (value) => {
  if (value === "1" || value === "yes") {
    return true;
  }
  if (value === "0" || value === "no") {
    return false;
  }
  if (!value) {
    return false;
  }
  return value.trim();
};

const addArrayValue = ({ buildingObj, key, value }) => {
  if (!buildingObj[key]) {
    buildingObj[key] = [];
  }
  if (!value) return;
  buildingObj[key].push(value);
};

const handleAddresses = ({ buildingObj, key, value, isEmail, isPhone }) => {
  const keys = key.split(" ");
  const type = keys[0];
  const tags = keys.slice(1);

  if (!value) return;

  if (isEmail) {
    const email = value.match(EMAIL_REGEX_VALIDATION)[0];
    if (!validate(email)) return;
    value = email;
  }

  if (isPhone) {
    const phone = buildAndValidatePhone(value);
    if (!phone) return;
    value = phone;
  }

  let addressObj = {
    type,
    tags,
    address: value,
  };

  addArrayValue({ buildingObj, key: "addresses", value: addressObj });
};

const handleBuildObject = (keys, data, buildingObj) => {
  var buildingObj = buildingObj || {};

  keys.forEach((key, index) => {
    const valueSplitted = data[index].split(VALUE_REGEX_SEPARATOR);
    valueSplitted.forEach((split) => {
      const splitFormated = formatValue(split);

      const isEmail = key.includes("email");
      const isPhone = key.includes("phone");
      const isAddress = isEmail || isPhone || key.split(" ").length > 1;
      const isMultiple = keys.filter((x) => x == key).length > 1;
      const hasKey = buildingObj[key];

      if (isAddress)
        handleAddresses({
          buildingObj,
          key,
          value: splitFormated,
          isEmail,
          isPhone,
        });
      if (isMultiple) addArrayValue({ buildingObj, key, value: splitFormated });
      if (!hasKey && !isAddress && !isMultiple)
        buildingObj[key] = splitFormated;
    });
  });

  return buildingObj;
};

const handleCreateJson = (titles, data) => {
  let arr = [];
  const pkIndex = titles.indexOf(CSV_PK);
  data.forEach((row) => {
    const twofoldObj = arr.find((obj) => obj[CSV_PK] === row[pkIndex]);
    const builtObj = handleBuildObject(titles, row, twofoldObj);
    if (twofoldObj) {
      arr = dropWhile(arr, twofoldObj);
    }
    arr.push(builtObj);
  });

  const jsonContent = JSON.stringify(arr);
  fs.writeFile(JSON_FILE_NAME, jsonContent, "utf8", (err) => {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return;
    }
    console.log("JSON file has been saved.");
  });
};

createReadStream(CSV_FILE_NAME)
  .pipe(parse({ delimiter: "," }))
  .on("data", (csvrow) => {
    csvData.push(csvrow);
  })
  .on("end", () => {
    handleCreateJson(csvData[0], csvData.slice(1));
  });
