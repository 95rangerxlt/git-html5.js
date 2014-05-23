/*jshint browser:true */
"use strict";
define(['utils/misc_utils', 'utils/file_utils', 'thirdparty/2.2.0-sha1'], function(miscUtils, fileUtils, _sha1_) {
    var HEADER_VER_OFFSET = 4;
    var HEADER_ENTRIES_COUNT_OFFSET = HEADER_VER_OFFSET + 4;
    var FIRST_ENTRY_OFFSET = HEADER_ENTRIES_COUNT_OFFSET + 4;
    var ENTRY_OFFSET_TO_SHA = 4 * 10; //10 32bit fields
    var MAGIC = 0x44495243;	/* "DIRC" */
    
    // This object parses the data contained in the git dircache, aka .git/index file
    var Dircache = function(buf) {
        var entries = {}; //map entry path to entry data obj
        var data, uv8;
        var entriesCount = 0;
        var versionNum = 0;
        
        if (buf) {
            data = new DataView(buf);
            uv8 = new Uint8Array(buf);
            
            //check magic number...
            if (MAGIC !== data.getUint32(0)) {
                console.error("INVALID Dircache file");
                throw new Error("INVALID Dircache file");
            }
            versionNum = data.getUint32(HEADER_VER_OFFSET);
            entriesCount = data.getUint32(HEADER_ENTRIES_COUNT_OFFSET);
            console.log("Dircache ver:"+versionNum+" entries:"+entriesCount);

            var nextOffset = FIRST_ENTRY_OFFSET;
            var entry = {};
            for (var i=0; i < entriesCount; i++) {
                nextOffset = readEntry(data, uv8, nextOffset, entry);
                entries[entry.path] = entry;
                entry = {};
            }
        }
        
        this.getEntry = function(path) {
            return entries[path];
        };
        
        this.entriesCount = function() {
            return entriesCount;
        };
        
        this.addEntry = function(path, sha, modTime, size) {
            if (!entries[path]) {
                entriesCount++;
            }
            if (sha instanceof ArrayBuffer) {
                sha = miscUtils.convertBytesToSha(sha);
            }
            entries[path] = {
                sha: sha,
                path: path,
                modTime : modTime,
                size : size
            };
        };
        
        /**
         * @return an Array of entries in Git sort order
         */
        this.getSortedEntryPaths = function() {
            var entryPathsSorted = Object.keys(entries);
            //first sort entries per Git index sort order
            return entryPathsSorted.sort();
        };
        
        /**
         * @return ArayBuffer with dircache formated to binary format expected by Git as per:
         *   http://code.google.com/p/git-core/source/browse/Documentation/technical/index-format.txt
         */
        this.getBinFormat = function() {
            var header = createFileHeader(entriesCount);
            var sortedEntryPaths = this.getSortedEntryPaths();
            var binEntries = [];
            var sha1OfBin;
            
            for(var i=0; i < sortedEntryPaths.length; i++) {
                binEntries.push(createEntry(entries[sortedEntryPaths[i]]));
            }
            var entriesSize = 0;
            for(i = 0; i < binEntries.length; i++) {
                entriesSize += binEntries[i].byteLength;
            }
            var indexBinary = new Uint8Array(header.byteLength + entriesSize  + 20); //20 for the trailing sha1
            indexBinary.set(new Uint8Array(header));
            var offset = header.byteLength;
            binEntries.forEach(function(val) {
                indexBinary.set(new Uint8Array(val), offset);
                offset += val.byteLength;
            });
            //now take sha of whole thing
            sha1OfBin = Crypto.SHA1(indexBinary.subarray(0, indexBinary.byteLength - 20));
            sha1OfBin = miscUtils.convertShaToBytes(sha1OfBin);
            indexBinary.set(sha1OfBin, offset);
            return indexBinary.buffer;
        }
    };  

    function compareShas(sha1, sha2){
         // assume the first byte has been matched in the fan out table
        for (var i = 1; i < 20; i++){
            if (sha1[i] != sha2[i]){
                return sha1[i] - sha2[i];
            }
        }
        return 0;
    }
    
    function getShaAtIndex(uv8, byteOffset){
        return uv8.subarray(byteOffset, byteOffset + 20); 
    }
        
    /**
     * @return String, null termindated string read from dataView, not inc the null char
     */
    function readNullTermString(dataView, offset) {
        var str = "";
        var count = 0;
        var c = dataView.getUint8(offset)
        while (c != 0) {
            str += String.fromCharCode(c);
            c = dataView.getUint8(offset+(++count));
        }
        return str;
    }
    
    /**
     * @return Number, the number of padding nulls required as per the Git Index file spec
     */
    function numberOfPaddingNulls(entrySize) {
        return 8 - (entrySize % 8); //allow for upto 8 padding nulls
    }
    
    /**
     * will populate the passed in entry object with props for the reaad entry, props are:
     *
     * sha (String), path (String), modTime (Date), size (Number)
     * returns the new offset
     */
    function readEntry(dataView, uint8Arr, offset, entry) {
        var FILE_SIZE_OFFSET = offset + (4 * 9); //10th 32bit field
        var SHA_OFFSET = FILE_SIZE_OFFSET + 4;
        
        var FLAGS_V2_OFFSET = SHA_OFFSET + 20; //160 bits for sha1 
        var PATH_OFFSET = SHA_OFFSET + 20 + 2; //16bits for flags field in v2

        var ctime = dataView.getUint32(offset);
        var ctimeNanoSecs = dataView.getUint32(offset+4);
        var mtime = dataView.getUint32(offset+8);
        var mtimeNanoSecs = dataView.getUint32(offset+12);
        var time = ctime > mtime ? ctime : mtime;
        var timeNano = ctime > mtime ? ctimeNanoSecs : mtimeNanoSecs;
        var combinedTime = ((time * 1000) + ((timeNano / Math.pow(10, 6)) | 0));
        
        entry.modTime = new Date(combinedTime);
        entry.size = dataView.getUint32(FILE_SIZE_OFFSET);
        entry.sha = miscUtils.convertBytesToSha(getShaAtIndex(uint8Arr, SHA_OFFSET));
        entry.path = readNullTermString(dataView, PATH_OFFSET);
        var entrySize = (PATH_OFFSET - offset);
        var padding = numberOfPaddingNulls(entrySize + entry.path.length);
        var nextEntryOffset = entry.path.length + padding;
        return PATH_OFFSET + nextEntryOffset;
    }
    
    // given a entry JS obj, return a ArrayBuffer for the entry in format for index file
    // entry is expected to have the props:
    // path, sha, size, modTime
    function createEntry(entry) {
        if (!validEntry(entry)) {
            console.error("invalid entry", entry);
            return;
        }
        
        //10*4 bytes for 32b stat-fields, 20bytes for 160bit SHA,2 for 16bit flags field
        var size = (10 * 4) + 20 + 2 + entry.path.length;
        var nullExtras = 8 - (size % 8); //pad to bytes while ensurign always have at least 1 null-byte terminator
        size += nullExtras;
        //console.log(entry.path+" size:"+size);
        
        var timeSecs = entry.modTime.getTime() / 1000 | 0;
        var timeNanoSecs =  (entry.modTime.getTime() % 1000) * Math.pow(10, 6);
        var shaArr = (typeof entry.sha == "string") ? miscUtils.convertShaToBytes(entry.sha) : entry.sha;
        
        var uv8 = new Uint8Array(size);
        var dv = new DataView(uv8.buffer);
        
        dv.setUint32(0, timeSecs); //ctime
        dv.setUint32(4, timeNanoSecs); //ctime
        dv.setUint32(8, timeSecs); //mtime
        dv.setUint32(12, timeNanoSecs); //mtime
        
        dv.setUint32(16, 0); //dev 32field - N/A for us
        dv.setUint32(20, 0); //ino 32field - N/A for us
        
        dv.setUint32(24, 0x8000); //mode 32bit field is 100644 for normal file
        
        dv.setUint32(28, 0x0); //uid 32bit field
        dv.setUint32(32, 0x0); //gid 32bit field
        dv.setUint32(36, entry.size); //file size as 32bit field
        uv8.set(shaArr, 40); //sha as 160bit (20Byte) field
        dv.setUint16(60, (entry.path.length < 4095 ? entry.path.length : 4095)); //only 12bits for path length so if over must set to 0xFFF
        //FIX ME: Only supporting index file format ver 2 for now
        uv8.set(miscUtils.stringToBytes(entry.path), 62);
        
        return dv.buffer;
    }
    
    function validEntry(e) {
        if (!e.path || !(typeof e.path == "string")) {
            return false
        }
        if (!e.sha) {
            return false;
        }
        if (!e.modTime || !(e.modTime instanceof Date)) {
            return false;
        }
        if (e.size == null || !(typeof e.size == "number")) {
            return false;
        }
        return true;
    }
    
    function createFileHeader(entryCount) {
        var headerDV = new DataView(new ArrayBuffer(12));
        headerDV.setUint32(0, MAGIC);// "DIRC" as first 4 bytes in ascii        
        headerDV.setUint32(4, 2);
        headerDV.setUint32(8, entryCount || 0);
        return headerDV.buffer;
    }
    
    function getDircache(buffer) {
        return new Dircache(buffer);
    }
    
    // RETURN for this module
    return getDircache;
});