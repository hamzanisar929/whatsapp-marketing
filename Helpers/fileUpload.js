const multer = require('multer');
const fs = require('fs');
const path = require('path');


const ensureFilePathExist = (folderPath) => {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true }); 
    }
};


const createMulterStorage = (destinationPath) => {
    const filePath = path.join(__dirname, '..', 'public', 'uploads' , destinationPath);
    ensureFilePathExist(filePath); 

    return multer.diskStorage({
        destination: (req, file, cb) => {
            if (!filePath) {
                cb(new Error('Invalid file path'));
            } else {
                cb(null, filePath); 
            }
        },
        filename: (req, file, cb) => {
            if (!file || !file.originalname) {
                cb(new Error('File is missing or invalid')); 
            } else {
                const uniqueName = `${Date.now()}-${file.originalname}`; 
                cb(null, uniqueName); 
            }
        },
    });
};


const dynamicUploader = (destinationPath) => {
    const storage = createMulterStorage(destinationPath); 
    return multer({ storage }); 
};

module.exports = { dynamicUploader };
